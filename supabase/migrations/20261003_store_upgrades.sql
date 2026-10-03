-- Store upgrades: scheduled orders + anonymous visitor analytics
-- Run after 20261003_hardening.sql

alter table public.shop_settings
  add column if not exists scheduled_orders_enabled boolean not null default false;

alter table public.orders
  add column if not exists requested_time text not null default '';

update public.shop_settings
set whatsapp_order_template = replace(
  whatsapp_order_template,
  E'المنطقة: {{area}}\n\nالطلب:',
  E'المنطقة: {{area}}\nموعد الطلب: {{requested_time}}\n\nالطلب:'
)
where whatsapp_order_template not like '%{{requested_time}}%';

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  country_code text not null default 'غير معروف',
  device_type text not null default 'كمبيوتر',
  referrer text not null default ''
);

create index if not exists idx_site_visits_created_at on public.site_visits(created_at desc);
create index if not exists idx_site_visits_country on public.site_visits(country_code);
create index if not exists idx_site_visits_device on public.site_visits(device_type);

alter table public.site_visits enable row level security;

drop policy if exists "admins read visits" on public.site_visits;
create policy "admins read visits"
on public.site_visits for select
using (public.is_admin());

revoke all on public.site_visits from anon, authenticated;
grant select on public.site_visits to authenticated;

create or replace function public.record_store_visit(
  country_input text,
  device_input text,
  referrer_input text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.site_visits(country_code, device_type, referrer)
  values (
    left(coalesce(nullif(btrim(country_input),''),'غير معروف'),32),
    case when device_input in ('هاتف','جهاز لوحي','كمبيوتر') then device_input else 'كمبيوتر' end,
    left(coalesce(referrer_input,''),255)
  );
  return true;
end;
$$;

revoke all on function public.record_store_visit(text,text,text) from public;
grant execute on function public.record_store_visit(text,text,text) to anon, authenticated;

create or replace function public.create_store_order(order_payload jsonb, items_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
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
  order_number_value text := btrim(coalesce(order_payload->>'order_number',''));
  customer_name_value text := btrim(coalesce(order_payload->>'customer_name',''));
  customer_phone_value text := btrim(coalesce(order_payload->>'customer_phone',''));
  address_value text := btrim(coalesce(order_payload->>'address',''));
  notes_value text := btrim(coalesce(order_payload->>'notes',''));
  requested_time_value text := btrim(coalesce(order_payload->>'requested_time',''));
  result_items jsonb := '[]'::jsonb;
begin
  select * into s from public.shop_settings where id='main';
  if s.id is null then raise exception 'إعدادات المتجر غير موجودة'; end if;

  if s.store_status_mode = 'closed' then
    raise exception 'المحل مغلق حاليًا';
  end if;

  if order_number_value = '' or length(order_number_value) > 40 then
    raise exception 'رقم الطلب غير صحيح';
  end if;

  if s.require_name and customer_name_value = '' then raise exception 'الاسم مطلوب'; end if;
  if s.require_phone and customer_phone_value = '' then raise exception 'رقم الهاتف مطلوب'; end if;
  if s.require_address and address_value = '' then raise exception 'العنوان مطلوب'; end if;
  if s.require_notes and notes_value = '' then raise exception 'الملاحظات مطلوبة'; end if;

  if customer_name_value <> '' and length(customer_name_value) > 120 then raise exception 'الاسم طويل جدًا'; end if;
  if customer_phone_value <> '' and length(customer_phone_value) > 30 then raise exception 'رقم الهاتف طويل جدًا'; end if;
  if address_value <> '' and length(address_value) > 500 then raise exception 'العنوان طويل جدًا'; end if;
  if notes_value <> '' and length(notes_value) > 1000 then raise exception 'الملاحظات طويلة جدًا'; end if;
  if requested_time_value <> '' and length(requested_time_value) > 120 then raise exception 'موعد الطلب غير صحيح'; end if;

  if customer_phone_value <> '' then
    if length(regexp_replace(customer_phone_value, '[^0-9]', '', 'g')) < 10
       or length(regexp_replace(customer_phone_value, '[^0-9]', '', 'g')) > 15 then
      raise exception 'رقم الهاتف غير صحيح';
    end if;
  end if;

  if jsonb_array_length(coalesce(items_payload,'[]'::jsonb)) = 0 then
    raise exception 'السلة فارغة';
  end if;

  for item in select * from jsonb_array_elements(items_payload)
  loop
    q := coalesce((item->>'quantity')::numeric,0);
    if q <= 0 or q <> trunc(q) or q > 999 then
      raise exception 'كمية غير صحيحة';
    end if;

    select * into p
    from public.products
    where id=(item->>'product_id')::uuid
    for update;

    if p.id is null or p.hidden or not p.available then
      raise exception 'أحد المنتجات لم يعد متاحًا';
    end if;

    select * into o
    from public.product_options
    where id=(item->>'option_id')::uuid and product_id=p.id
    for update;

    if o.id is null or not o.available then
      raise exception 'أحد خيارات المنتج لم يعد متاحًا';
    end if;

    if p.track_stock and coalesce(p.stock_qty,0) < q then
      raise exception 'الكمية المطلوبة غير متاحة من المنتج: %', p.name_ar;
    end if;
    if o.track_stock and coalesce(o.stock_qty,0) < q then
      raise exception 'الكمية المطلوبة غير متاحة من الخيار: % - %', p.name_ar, o.name_ar;
    end if;

    line_total := o.price * q;
    subtotal := subtotal + line_total;
    result_items := result_items || jsonb_build_array(
      jsonb_build_object('id',item->>'id','unit_price',o.price,'line_total',line_total)
    );
  end loop;

  if subtotal < s.min_order then
    raise exception 'قيمة المنتجات أقل من الحد الأدنى للطلب';
  end if;

  if s.delivery_enabled then
    if s.require_area
       and exists(select 1 from public.delivery_areas where enabled=true)
       and nullif(order_payload->>'area_id','') is null then
      raise exception 'منطقة التوصيل مطلوبة';
    end if;

    if nullif(order_payload->>'area_id','') is not null then
      select * into a
      from public.delivery_areas
      where id=(order_payload->>'area_id')::uuid and enabled=true;

      if a.id is null then raise exception 'منطقة التوصيل غير متاحة'; end if;
      delivery := a.fee;
      area_name_value := a.name_ar;
    else
      delivery := s.default_delivery_fee;
    end if;
  end if;

  final_total := subtotal + delivery;

  insert into public.orders(
    id, order_number, customer_name, customer_phone, address,
    area_id, area_name, product_subtotal, delivery_fee, total,
    notes, requested_time, status
  ) values (
    order_id_value,
    order_number_value,
    customer_name_value,
    customer_phone_value,
    address_value,
    case when s.delivery_enabled and nullif(order_payload->>'area_id','') is not null
      then (order_payload->>'area_id')::uuid else null end,
    area_name_value,
    subtotal,
    delivery,
    final_total,
    notes_value,
    case when s.scheduled_orders_enabled then requested_time_value else '' end,
    'جديد'
  );

  for item in select * from jsonb_array_elements(items_payload)
  loop
    q := (item->>'quantity')::numeric;

    select * into p
    from public.products
    where id=(item->>'product_id')::uuid
    for update;

    select * into o
    from public.product_options
    where id=(item->>'option_id')::uuid and product_id=p.id
    for update;

    line_total := o.price * q;

    insert into public.order_items(
      id, order_id, product_id, product_name, option_id,
      option_name, unit_price, quantity, line_total
    ) values (
      (item->>'id')::uuid,
      order_id_value,
      p.id,
      p.name_ar,
      o.id,
      o.name_ar,
      o.price,
      q,
      line_total
    );

    if p.track_stock then
      update public.products
      set stock_qty=greatest(0,coalesce(stock_qty,0)-q), updated_at=now()
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
    'requested_time',case when s.scheduled_orders_enabled then requested_time_value else '' end,
    'items',result_items
  );
end;
$$;

revoke all on function public.create_store_order(jsonb,jsonb) from public;
grant execute on function public.create_store_order(jsonb,jsonb) to anon, authenticated;

select 'STORE UPGRADES MIGRATION SUCCESS' as result;
