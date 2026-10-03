-- Store final feature migration
-- Safe to run on an existing database. Does not delete products, orders, or admins.

alter table public.shop_settings add column if not exists require_name boolean not null default true;
alter table public.shop_settings add column if not exists require_phone boolean not null default true;
alter table public.shop_settings add column if not exists require_address boolean not null default true;
alter table public.shop_settings add column if not exists require_area boolean not null default true;
alter table public.shop_settings add column if not exists require_notes boolean not null default false;
alter table public.shop_settings add column if not exists delivery_enabled boolean not null default true;
alter table public.shop_settings add column if not exists store_status_mode text not null default 'auto';
alter table public.shop_settings add column if not exists low_stock_threshold numeric(12,2) not null default 5;
alter table public.shop_settings add column if not exists site_description text not null default '';
alter table public.shop_settings add column if not exists share_image_url text not null default '';
alter table public.shop_settings add column if not exists whatsapp_order_template text not null default E'طلب جديد\nرقم الطلب: #{{order_number}}\n\nالاسم: {{name}}\nرقم الهاتف: {{phone}}\nالعنوان: {{address}}\nالمنطقة: {{area}}\n\nالطلب:\n{{items}}\n\nإجمالي المنتجات: {{subtotal}}\nرسوم التوصيل: {{delivery_fee}}\nالإجمالي النهائي: {{total}}\n\nملاحظات: {{notes}}';
alter table public.shop_settings add column if not exists whatsapp_received_template text not null default 'مرحبًا {{name}}، تم استلام طلبك رقم #{{order_number}} من {{store_name}} وسيتم مراجعته الآن.';
alter table public.shop_settings add column if not exists whatsapp_preparing_template text not null default 'مرحبًا {{name}}، طلبك رقم #{{order_number}} جاري التجهيز الآن.';
alter table public.shop_settings add column if not exists whatsapp_delivery_template text not null default 'مرحبًا {{name}}، طلبك رقم #{{order_number}} خرج للتوصيل.';

update public.shop_settings
set store_status_mode = case
  when manual_open = false then 'closed'
  else coalesce(nullif(store_status_mode,''),'auto')
end
where id='main';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='shop_settings_status_mode_check') then
    alter table public.shop_settings
      add constraint shop_settings_status_mode_check
      check (store_status_mode in ('auto','open','closed'));
  end if;

  if not exists (select 1 from pg_constraint where conname='shop_settings_low_stock_nonnegative') then
    alter table public.shop_settings
      add constraint shop_settings_low_stock_nonnegative
      check (low_stock_threshold >= 0);
  end if;
end $$;

create or replace function public.create_store_order(order_payload jsonb, items_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.shop_settings%rowtype;
  item jsonb;
  p public.products%rowtype;
  o public.product_options%rowtype;
  a public.delivery_areas%rowtype;
  q numeric;
  line_total numeric;
  subtotal numeric := 0;
  delivery numeric := 0;
  final_total numeric := 0;
  area_name_value text := '';
  order_id_value uuid := (order_payload->>'id')::uuid;
  order_number_value text := order_payload->>'order_number';
  result_items jsonb := '[]'::jsonb;
begin
  select * into s from public.shop_settings where id='main';
  if s.id is null then raise exception 'إعدادات المتجر غير موجودة'; end if;
  if jsonb_array_length(coalesce(items_payload,'[]'::jsonb)) = 0 then raise exception 'السلة فارغة'; end if;

  for item in select * from jsonb_array_elements(items_payload)
  loop
    q := greatest(0, coalesce((item->>'quantity')::numeric,0));
    if q <= 0 then raise exception 'كمية غير صحيحة'; end if;

    select * into p from public.products where id=(item->>'product_id')::uuid for update;
    if p.id is null or p.hidden or not p.available then raise exception 'أحد المنتجات لم يعد متاحًا'; end if;

    select * into o from public.product_options where id=(item->>'option_id')::uuid and product_id=p.id for update;
    if o.id is null or not o.available then raise exception 'أحد خيارات المنتج لم يعد متاحًا'; end if;

    if p.track_stock and coalesce(p.stock_qty,0) < q then raise exception 'الكمية المطلوبة غير متاحة من المنتج: %', p.name_ar; end if;
    if o.track_stock and coalesce(o.stock_qty,0) < q then raise exception 'الكمية المطلوبة غير متاحة من الخيار: % - %', p.name_ar, o.name_ar; end if;

    line_total := o.price * q;
    subtotal := subtotal + line_total;
    result_items := result_items || jsonb_build_array(jsonb_build_object('id',item->>'id','unit_price',o.price,'line_total',line_total));
  end loop;

  if subtotal < s.min_order then raise exception 'قيمة المنتجات أقل من الحد الأدنى للطلب'; end if;

  if s.delivery_enabled then
    if nullif(order_payload->>'area_id','') is not null then
      select * into a from public.delivery_areas where id=(order_payload->>'area_id')::uuid and enabled=true;
      if a.id is null then raise exception 'منطقة التوصيل غير متاحة'; end if;
      delivery := a.fee;
      area_name_value := a.name_ar;
    else
      delivery := s.default_delivery_fee;
    end if;
  else
    delivery := 0;
    area_name_value := '';
  end if;

  final_total := subtotal + delivery;

  insert into public.orders(id,order_number,customer_name,customer_phone,address,area_id,area_name,product_subtotal,delivery_fee,total,notes,status)
  values(
    order_id_value,
    order_number_value,
    coalesce(order_payload->>'customer_name',''),
    coalesce(order_payload->>'customer_phone',''),
    coalesce(order_payload->>'address',''),
    case when s.delivery_enabled and nullif(order_payload->>'area_id','') is not null then (order_payload->>'area_id')::uuid else null end,
    area_name_value,
    subtotal,
    delivery,
    final_total,
    coalesce(order_payload->>'notes',''),
    'جديد'
  );

  for item in select * from jsonb_array_elements(items_payload)
  loop
    q := (item->>'quantity')::numeric;
    select * into p from public.products where id=(item->>'product_id')::uuid for update;
    select * into o from public.product_options where id=(item->>'option_id')::uuid and product_id=p.id for update;
    line_total := o.price * q;

    insert into public.order_items(id,order_id,product_id,product_name,option_id,option_name,unit_price,quantity,line_total)
    values((item->>'id')::uuid,order_id_value,p.id,p.name_ar,o.id,o.name_ar,o.price,q,line_total);

    if p.track_stock then
      update public.products
      set stock_qty=greatest(0,coalesce(stock_qty,0)-q),updated_at=now()
      where id=p.id;
    end if;

    if o.track_stock then
      update public.product_options
      set stock_qty=greatest(0,coalesce(stock_qty,0)-q)
      where id=o.id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'product_subtotal',subtotal,
    'delivery_fee',delivery,
    'total',final_total,
    'area_name',area_name_value,
    'items',result_items
  );
end;
$$;

grant execute on function public.create_store_order(jsonb,jsonb) to anon, authenticated;

create or replace function public.set_order_status(order_id_input uuid, new_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
  i public.order_items%rowtype;
  p public.products%rowtype;
  o public.product_options%rowtype;
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;
  if new_status not in ('جديد','جاري التجهيز','خرج للتوصيل','مكتمل','ملغي') then raise exception 'حالة غير صحيحة'; end if;

  select status into old_status from public.orders where id=order_id_input for update;
  if old_status is null then raise exception 'الطلب غير موجود'; end if;
  if old_status = new_status then return true; end if;

  if new_status='ملغي' and old_status<>'ملغي' then
    for i in select * from public.order_items where order_id=order_id_input loop
      select * into p from public.products where id=i.product_id for update;
      select * into o from public.product_options where id=i.option_id for update;

      if p.id is not null and p.track_stock then
        update public.products set stock_qty=coalesce(stock_qty,0)+i.quantity,updated_at=now() where id=p.id;
      end if;

      if o.id is not null and o.track_stock then
        update public.product_options set stock_qty=coalesce(stock_qty,0)+i.quantity where id=o.id;
      end if;
    end loop;

  elsif old_status='ملغي' and new_status<>'ملغي' then
    for i in select * from public.order_items where order_id=order_id_input loop
      select * into p from public.products where id=i.product_id for update;
      select * into o from public.product_options where id=i.option_id for update;

      if p.id is not null and p.track_stock and coalesce(p.stock_qty,0)<i.quantity then
        raise exception 'لا يوجد مخزون كاف لإعادة تفعيل الطلب';
      end if;

      if o.id is not null and o.track_stock and coalesce(o.stock_qty,0)<i.quantity then
        raise exception 'لا يوجد مخزون كاف لإعادة تفعيل الطلب';
      end if;

      if p.id is not null and p.track_stock then
        update public.products set stock_qty=coalesce(stock_qty,0)-i.quantity,updated_at=now() where id=p.id;
      end if;

      if o.id is not null and o.track_stock then
        update public.product_options set stock_qty=coalesce(stock_qty,0)-i.quantity where id=o.id;
      end if;
    end loop;
  end if;

  update public.orders set status=new_status where id=order_id_input;
  return true;
end;
$$;

grant execute on function public.set_order_status(uuid,text) to authenticated;

revoke insert on public.orders, public.order_items from anon;
revoke insert on public.orders, public.order_items from authenticated;
grant select, update, delete on public.orders, public.order_items to authenticated;

update storage.buckets
set public=true,
    file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif']
where id='store-images';

select 'FINAL MIGRATION SUCCESS' as result;
