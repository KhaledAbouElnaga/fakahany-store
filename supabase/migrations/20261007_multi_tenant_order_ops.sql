-- Tenant-aware order management RPCs.

create or replace function public.save_order_status_definition(
  status_id_input uuid,
  name_input text,
  note_input text,
  display_order_input integer,
  active_input boolean,
  is_new_input boolean,
  is_completed_input boolean,
  is_cancelled_input boolean
)
returns public.order_statuses
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  old_name text;
  result_row public.order_statuses%rowtype;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('settings.manage') then raise exception 'غير مصرح'; end if;
  if btrim(coalesce(name_input,''))='' then raise exception 'اسم الحالة مطلوب'; end if;
  if length(btrim(name_input))>80 then raise exception 'اسم الحالة طويل جدًا'; end if;
  if (case when is_new_input then 1 else 0 end)
     +(case when is_completed_input then 1 else 0 end)
     +(case when is_cancelled_input then 1 else 0 end)>1 then
    raise exception 'الحالة لا يمكن أن تكون جديدة ومكتملة وملغية في نفس الوقت';
  end if;

  select name into old_name
  from public.order_statuses
  where store_id=sid and id=status_id_input
  for update;

  insert into public.order_statuses(
    store_id,id,name,note,display_order,active,is_new,is_completed,is_cancelled,updated_at
  ) values(
    sid,status_id_input,btrim(name_input),left(coalesce(note_input,''),300),
    coalesce(display_order_input,0),coalesce(active_input,true),
    coalesce(is_new_input,false),coalesce(is_completed_input,false),coalesce(is_cancelled_input,false),now()
  )
  on conflict(id) do update set
    name=excluded.name,note=excluded.note,display_order=excluded.display_order,
    active=excluded.active,is_new=excluded.is_new,is_completed=excluded.is_completed,
    is_cancelled=excluded.is_cancelled,updated_at=now()
  where public.order_statuses.store_id=sid
  returning * into result_row;

  if result_row.id is null then raise exception 'لا يمكن تعديل حالة تخص متجرًا آخر'; end if;

  if old_name is not null and old_name<>result_row.name then
    update public.orders set status=result_row.name
    where store_id=sid and status=old_name;
  end if;

  return result_row;
end;
$$;

create or replace function public.set_order_internal_note(order_id_input uuid,note_input text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('orders.manage') then raise exception 'غير مصرح'; end if;
  update public.orders
  set internal_note=left(coalesce(note_input,''),2000)
  where store_id=sid and id=order_id_input;
  if not found then raise exception 'الطلب غير موجود'; end if;
  perform public.log_order_event(order_id_input,'internal_note','تم تعديل الملاحظة الداخلية');
  return true;
end;
$$;

create or replace function public.set_order_status(order_id_input uuid,new_status text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  old_status text;
  old_cancelled boolean:=false;
  new_cancelled boolean:=false;
  i public.order_items%rowtype;
  p public.products%rowtype;
  o public.product_options%rowtype;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('orders.manage') then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from public.order_statuses where store_id=sid and name=new_status and active=true) then
    raise exception 'حالة الطلب غير متاحة';
  end if;

  select status into old_status
  from public.orders
  where store_id=sid and id=order_id_input
  for update;
  if old_status is null then raise exception 'الطلب غير موجود'; end if;
  if old_status=new_status then return true; end if;

  select coalesce(is_cancelled,false) into old_cancelled
  from public.order_statuses where store_id=sid and name=old_status;
  old_cancelled:=coalesce(old_cancelled,old_status='ملغي');

  select coalesce(is_cancelled,false) into new_cancelled
  from public.order_statuses where store_id=sid and name=new_status;
  new_cancelled:=coalesce(new_cancelled,false);

  if new_cancelled and not old_cancelled then
    for i in select * from public.order_items where store_id=sid and order_id=order_id_input loop
      select * into p from public.products where store_id=sid and id=i.product_id for update;
      select * into o from public.product_options where store_id=sid and id=i.option_id for update;
      if p.id is not null and p.track_stock then
        update public.products set stock_qty=coalesce(stock_qty,0)+i.quantity,updated_at=now()
        where store_id=sid and id=p.id;
      end if;
      if o.id is not null and o.track_stock then
        update public.product_options set stock_qty=coalesce(stock_qty,0)+i.quantity
        where store_id=sid and id=o.id;
      end if;
    end loop;
  elsif old_cancelled and not new_cancelled then
    for i in select * from public.order_items where store_id=sid and order_id=order_id_input loop
      select * into p from public.products where store_id=sid and id=i.product_id for update;
      select * into o from public.product_options where store_id=sid and id=i.option_id for update;
      if p.id is not null and p.track_stock and coalesce(p.stock_qty,0)<i.quantity then raise exception 'لا يوجد مخزون كاف لإعادة تفعيل الطلب'; end if;
      if o.id is not null and o.track_stock and coalesce(o.stock_qty,0)<i.quantity then raise exception 'لا يوجد مخزون كاف لإعادة تفعيل الطلب'; end if;
      if p.id is not null and p.track_stock then
        update public.products set stock_qty=coalesce(stock_qty,0)-i.quantity,updated_at=now()
        where store_id=sid and id=p.id;
      end if;
      if o.id is not null and o.track_stock then
        update public.product_options set stock_qty=coalesce(stock_qty,0)-i.quantity
        where store_id=sid and id=o.id;
      end if;
    end loop;
  end if;

  update public.orders set status=new_status
  where store_id=sid and id=order_id_input;

  perform public.log_order_event(order_id_input,'status','تم تغيير الحالة من «'||old_status||'» إلى «'||new_status||'»');
  return true;
end;
$$;

create or replace function public.edit_store_order(order_id_input uuid,order_payload jsonb,items_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  ord public.orders%rowtype;
  s public.shop_settings%rowtype;
  st public.order_statuses%rowtype;
  item jsonb;
  p public.products%rowtype;
  o public.product_options%rowtype;
  a public.delivery_areas%rowtype;
  old_item public.order_items%rowtype;
  q numeric;
  subtotal numeric:=0;
  delivery numeric:=0;
  final_total numeric:=0;
  area_name_value text:='';
  requested_for_value timestamptz:=nullif(order_payload->>'requested_for','')::timestamptz;
  slot_start timestamptz;
  slot_end timestamptz;
  slot_seconds integer;
  slot_count integer;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('orders.manage') then raise exception 'غير مصرح'; end if;
  perform public.apply_due_scheduled_prices(sid);

  select * into ord from public.orders where store_id=sid and id=order_id_input for update;
  if ord.id is null then raise exception 'الطلب غير موجود'; end if;

  select * into s from public.shop_settings where store_id=sid limit 1;
  select * into st from public.order_statuses where store_id=sid and name=ord.status;

  if s.delivery_enabled and s.delivery_capacity_enabled and s.delivery_slot_capacity>0 and requested_for_value is not null then
    slot_seconds:=greatest(15,least(240,s.delivery_slot_minutes))*60;
    slot_start:=date_trunc('day',requested_for_value)
      + floor(extract(epoch from (requested_for_value-date_trunc('day',requested_for_value)))/slot_seconds)*slot_seconds*interval '1 second';
    slot_end:=slot_start+slot_seconds*interval '1 second';

    select count(*)::integer into slot_count
    from public.orders other
    left join public.order_statuses other_status on other_status.store_id=other.store_id and other_status.name=other.status
    where other.store_id=sid
      and other.id<>order_id_input
      and other.archived_at is null
      and other.requested_for>=slot_start and other.requested_for<slot_end
      and coalesce(other_status.is_cancelled,false)=false;
    if slot_count>=s.delivery_slot_capacity then raise exception 'الفترة المختارة ممتلئة. اختر موعدًا آخر'; end if;
  end if;

  if not coalesce(st.is_cancelled,false) then
    for old_item in select * from public.order_items where store_id=sid and order_id=order_id_input loop
      select * into p from public.products where store_id=sid and id=old_item.product_id for update;
      select * into o from public.product_options where store_id=sid and id=old_item.option_id for update;
      if p.id is not null and p.track_stock then
        update public.products set stock_qty=coalesce(stock_qty,0)+old_item.quantity,updated_at=now()
        where store_id=sid and id=p.id;
      end if;
      if o.id is not null and o.track_stock then
        update public.product_options set stock_qty=coalesce(stock_qty,0)+old_item.quantity
        where store_id=sid and id=o.id;
      end if;
    end loop;
  end if;

  if jsonb_array_length(coalesce(items_payload,'[]'::jsonb))=0 then
    raise exception 'يجب أن يحتوي الطلب على منتج واحد على الأقل';
  end if;

  for item in select * from jsonb_array_elements(items_payload) loop
    q:=coalesce((item->>'quantity')::numeric,0);
    if q<=0 or q<>trunc(q) or q>999 then raise exception 'كمية غير صحيحة'; end if;

    select * into p from public.products where store_id=sid and id=(item->>'product_id')::uuid for update;
    select * into o from public.product_options where store_id=sid and id=(item->>'option_id')::uuid and product_id=p.id for update;
    if p.id is null or o.id is null then raise exception 'أحد المنتجات أو الخيارات لم يعد موجودًا'; end if;

    if not coalesce(st.is_cancelled,false) then
      if p.track_stock and coalesce(p.stock_qty,0)<q then raise exception 'المخزون غير كاف للمنتج: %',p.name_ar; end if;
      if o.track_stock and coalesce(o.stock_qty,0)<q then raise exception 'المخزون غير كاف للخيار: % - %',p.name_ar,o.name_ar; end if;
    end if;
    subtotal:=subtotal+o.price*q;
  end loop;

  if s.delivery_enabled then
    if nullif(order_payload->>'area_id','') is not null then
      select * into a from public.delivery_areas
      where store_id=sid and id=(order_payload->>'area_id')::uuid and enabled=true;
      if a.id is null then raise exception 'منطقة التوصيل غير متاحة'; end if;
      delivery:=a.fee;area_name_value:=a.name_ar;
    else
      delivery:=s.default_delivery_fee;
    end if;
  end if;

  final_total:=subtotal+delivery;

  delete from public.order_items where store_id=sid and order_id=order_id_input;

  for item in select * from jsonb_array_elements(items_payload) loop
    q:=(item->>'quantity')::numeric;
    select * into p from public.products where store_id=sid and id=(item->>'product_id')::uuid for update;
    select * into o from public.product_options where store_id=sid and id=(item->>'option_id')::uuid and product_id=p.id for update;

    insert into public.order_items(
      store_id,id,order_id,product_id,product_name,option_id,option_name,unit_price,quantity,line_total
    ) values(
      sid,coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),order_id_input,
      p.id,p.name_ar,o.id,o.name_ar,o.price,q,o.price*q
    );

    if not coalesce(st.is_cancelled,false) then
      if p.track_stock then
        update public.products set stock_qty=coalesce(stock_qty,0)-q,updated_at=now()
        where store_id=sid and id=p.id;
      end if;
      if o.track_stock then
        update public.product_options set stock_qty=coalesce(stock_qty,0)-q
        where store_id=sid and id=o.id;
      end if;
    end if;
  end loop;

  update public.orders set
    customer_name=left(btrim(coalesce(order_payload->>'customer_name',customer_name)),120),
    customer_phone=left(btrim(coalesce(order_payload->>'customer_phone',customer_phone)),30),
    address=left(btrim(coalesce(order_payload->>'address',address)),500),
    area_id=case when s.delivery_enabled and nullif(order_payload->>'area_id','') is not null then (order_payload->>'area_id')::uuid else null end,
    area_name=area_name_value,
    product_subtotal=subtotal,
    delivery_fee=delivery,
    total=final_total,
    notes=left(coalesce(order_payload->>'notes',notes),1000),
    requested_time=left(coalesce(order_payload->>'requested_time',requested_time),120),
    requested_for=requested_for_value
  where store_id=sid and id=order_id_input;

  perform public.log_order_event(order_id_input,'edit','تم تعديل محتويات الطلب وإعادة حساب الإجمالي');

  return jsonb_build_object(
    'ok',true,'product_subtotal',subtotal,'delivery_fee',delivery,
    'total',final_total,'area_name',area_name_value
  );
end;
$$;
