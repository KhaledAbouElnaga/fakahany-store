-- Tenant-aware storefront and public RPCs.

create or replace function public.apply_default_order_status()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare default_name text;
begin
  if new.status is null or btrim(new.status)='' or new.status='جديد' then
    select name into default_name
    from public.order_statuses
    where store_id=new.store_id and active=true and is_new=true
    order by display_order,id
    limit 1;
    new.status:=coalesce(default_name,'جديد');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_order_guardrails()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  s public.shop_settings%rowtype;
  phone_digits text;
  recent_count integer;
  daily_count integer;
  device_prefix text;
  device_recent_count integer;
begin
  select * into s from public.shop_settings where store_id=new.store_id limit 1;
  if s.store_id is null then raise exception 'إعدادات المتجر غير موجودة'; end if;
  if coalesce(s.maintenance_mode,false) then
    raise exception 'المتجر تحت الصيانة حاليًا ولا يستقبل طلبات جديدة';
  end if;

  device_prefix:=split_part(coalesce(new.client_token,''),'.',1);
  if length(device_prefix)>=12 then
    select count(*)::integer into device_recent_count
    from public.orders
    where store_id=new.store_id
      and split_part(coalesce(client_token,''),'.',1)=device_prefix
      and created_at>now()-interval '10 minutes';
    if device_recent_count>=5 then
      raise exception 'تم إرسال عدة طلبات من هذا الجهاز خلال وقت قصير. حاول مرة أخرى بعد قليل';
    end if;
  end if;

  phone_digits:=regexp_replace(coalesce(new.customer_phone,''),'[^0-9]','','g');
  if phone_digits<>'' then
    select count(*)::integer into recent_count
    from public.orders
    where store_id=new.store_id
      and regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')=phone_digits
      and created_at>now()-interval '10 minutes';
    if recent_count>=4 then raise exception 'تم إرسال عدة طلبات خلال وقت قصير. حاول مرة أخرى بعد قليل'; end if;

    select count(*)::integer into daily_count
    from public.orders
    where store_id=new.store_id
      and regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')=phone_digits
      and created_at>now()-interval '24 hours';
    if daily_count>=12 then raise exception 'تم الوصول للحد المؤقت لعدد الطلبات. تواصل مع المتجر إذا كنت تحتاج مساعدة'; end if;
  end if;

  return new;
end;
$$;

create or replace function public.apply_due_scheduled_prices(store_id_input uuid)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare r public.scheduled_prices%rowtype; applied integer:=0;
begin
  if store_id_input is null then return 0; end if;
  for r in
    select * from public.scheduled_prices
    where store_id=store_id_input and starts_at<=now()
    order by starts_at
    for update skip locked
  loop
    update public.product_options
    set price=r.price,old_price=r.old_price
    where id=r.product_option_id and store_id=store_id_input;
    delete from public.scheduled_prices where id=r.id and store_id=store_id_input;
    applied:=applied+1;
  end loop;
  return applied;
end;
$$;

create or replace function public.apply_due_scheduled_prices()
returns integer
language sql
security definer
set search_path=pg_catalog,public
as $$
  select public.apply_due_scheduled_prices(coalesce(public.current_store_id(),public.default_store_id()));
$$;

create or replace function public.log_order_event(order_id_input uuid,event_type_input text,summary_input text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare sid uuid;
begin
  select store_id into sid from public.orders where id=order_id_input;
  if sid is null then return; end if;

  insert into public.order_events(store_id,order_id,actor_user_id,event_type,summary)
  values(sid,order_id_input,auth.uid(),left(coalesce(event_type_input,''),40),left(coalesce(summary_input,''),300));

  delete from public.order_events
  where store_id=sid and id in (
    select id from public.order_events
    where store_id=sid and order_id=order_id_input
    order by created_at desc
    offset 30
  );
end;
$$;

create or replace function public.create_store_order(store_id_input uuid,order_payload jsonb,items_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  s public.shop_settings%rowtype;
  item jsonb;
  p public.products%rowtype;
  o public.product_options%rowtype;
  a public.delivery_areas%rowtype;
  q numeric;
  line_total numeric;
  subtotal numeric:=0;
  delivery numeric:=0;
  final_total numeric:=0;
  area_name_value text:='';
  order_id_value uuid:=(order_payload->>'id')::uuid;
  order_number_value text:=btrim(coalesce(order_payload->>'order_number',''));
  customer_name_value text:=btrim(coalesce(order_payload->>'customer_name',''));
  customer_phone_value text:=btrim(coalesce(order_payload->>'customer_phone',''));
  address_value text:=btrim(coalesce(order_payload->>'address',''));
  notes_value text:=btrim(coalesce(order_payload->>'notes',''));
  requested_time_value text:=btrim(coalesce(order_payload->>'requested_time',''));
  requested_for_value timestamptz:=nullif(order_payload->>'requested_for','')::timestamptz;
  client_token_value text:=left(btrim(coalesce(order_payload->>'client_token','')),100);
  result_items jsonb:='[]'::jsonb;
  existing public.orders%rowtype;
  slot_start timestamptz;
  slot_end timestamptz;
  slot_seconds integer;
  slot_count integer;
begin
  if store_id_input is null or not exists(select 1 from public.stores where id=store_id_input and status='active') then
    raise exception 'المتجر غير متاح';
  end if;

  perform public.apply_due_scheduled_prices(store_id_input);

  if client_token_value<>'' then
    select * into existing from public.orders
    where store_id=store_id_input and client_token=client_token_value;
    if existing.id is not null then
      return jsonb_build_object(
        'ok',true,'duplicate',true,'order_id',existing.id,'order_number',existing.order_number,
        'product_subtotal',existing.product_subtotal,'delivery_fee',existing.delivery_fee,
        'total',existing.total,'area_name',existing.area_name,'requested_time',existing.requested_time,
        'items','[]'::jsonb
      );
    end if;
  end if;

  select * into s from public.shop_settings where store_id=store_id_input limit 1;
  if s.store_id is null then raise exception 'إعدادات المتجر غير موجودة'; end if;
  if s.store_status_mode='closed' then raise exception 'المحل مغلق حاليًا'; end if;
  if order_number_value='' or length(order_number_value)>40 then raise exception 'رقم الطلب غير صحيح'; end if;
  if s.require_name and customer_name_value='' then raise exception 'الاسم مطلوب'; end if;
  if s.require_phone and customer_phone_value='' then raise exception 'رقم الهاتف مطلوب'; end if;
  if s.require_address and address_value='' then raise exception 'العنوان مطلوب'; end if;
  if s.require_notes and notes_value='' then raise exception 'الملاحظات مطلوبة'; end if;
  if customer_name_value<>'' and length(customer_name_value)>120 then raise exception 'الاسم طويل جدًا'; end if;
  if customer_phone_value<>'' and length(customer_phone_value)>30 then raise exception 'رقم الهاتف طويل جدًا'; end if;
  if address_value<>'' and length(address_value)>500 then raise exception 'العنوان طويل جدًا'; end if;
  if notes_value<>'' and length(notes_value)>1000 then raise exception 'الملاحظات طويلة جدًا'; end if;

  if customer_phone_value<>'' then
    if length(regexp_replace(customer_phone_value,'[^0-9]','','g'))<10
       or length(regexp_replace(customer_phone_value,'[^0-9]','','g'))>15 then
      raise exception 'رقم الهاتف غير صحيح';
    end if;
  end if;

  if s.scheduled_orders_enabled and requested_time_value<>'' and requested_time_value<>'في أقرب وقت' and requested_for_value is null then
    raise exception 'موعد الطلب غير صحيح';
  end if;

  if s.delivery_enabled and s.delivery_capacity_enabled and s.delivery_slot_capacity>0 and requested_for_value is not null then
    slot_seconds:=greatest(15,least(240,s.delivery_slot_minutes))*60;
    slot_start:=date_trunc('day',requested_for_value)
      + floor(extract(epoch from (requested_for_value-date_trunc('day',requested_for_value)))/slot_seconds)*slot_seconds*interval '1 second';
    slot_end:=slot_start+slot_seconds*interval '1 second';

    select count(*)::integer into slot_count
    from public.orders ord
    left join public.order_statuses st on st.store_id=ord.store_id and st.name=ord.status
    where ord.store_id=store_id_input
      and ord.archived_at is null
      and ord.requested_for>=slot_start and ord.requested_for<slot_end
      and coalesce(st.is_cancelled,false)=false;
    if slot_count>=s.delivery_slot_capacity then raise exception 'الفترة المختارة ممتلئة. اختر موعدًا آخر'; end if;
  end if;

  if jsonb_array_length(coalesce(items_payload,'[]'::jsonb))=0 then raise exception 'السلة فارغة'; end if;

  for item in select * from jsonb_array_elements(items_payload) loop
    q:=coalesce((item->>'quantity')::numeric,0);
    if q<=0 or q<>trunc(q) or q>999 then raise exception 'كمية غير صحيحة'; end if;

    select * into p from public.products
    where store_id=store_id_input and id=(item->>'product_id')::uuid for update;
    if p.id is null or p.hidden or not p.available then raise exception 'أحد المنتجات لم يعد متاحًا'; end if;

    select * into o from public.product_options
    where store_id=store_id_input and id=(item->>'option_id')::uuid and product_id=p.id for update;
    if o.id is null or not o.available then raise exception 'أحد خيارات المنتج لم يعد متاحًا'; end if;

    if p.track_stock and coalesce(p.stock_qty,0)<q then raise exception 'الكمية المطلوبة غير متاحة من المنتج: %',p.name_ar; end if;
    if o.track_stock and coalesce(o.stock_qty,0)<q then raise exception 'الكمية المطلوبة غير متاحة من الخيار: % - %',p.name_ar,o.name_ar; end if;

    line_total:=o.price*q;
    subtotal:=subtotal+line_total;
    result_items:=result_items||jsonb_build_array(jsonb_build_object('id',item->>'id','unit_price',o.price,'line_total',line_total));
  end loop;

  if subtotal<s.min_order then raise exception 'قيمة المنتجات أقل من الحد الأدنى للطلب'; end if;

  if s.delivery_enabled then
    if s.require_area and exists(select 1 from public.delivery_areas where store_id=store_id_input and enabled=true)
       and nullif(order_payload->>'area_id','') is null then raise exception 'منطقة التوصيل مطلوبة'; end if;

    if nullif(order_payload->>'area_id','') is not null then
      select * into a from public.delivery_areas
      where store_id=store_id_input and id=(order_payload->>'area_id')::uuid and enabled=true;
      if a.id is null then raise exception 'منطقة التوصيل غير متاحة'; end if;
      delivery:=a.fee;area_name_value:=a.name_ar;
    else delivery:=s.default_delivery_fee;
    end if;
  end if;

  final_total:=subtotal+delivery;

  insert into public.orders(
    store_id,id,order_number,customer_name,customer_phone,address,area_id,area_name,
    product_subtotal,delivery_fee,total,notes,requested_time,requested_for,client_token,status
  ) values(
    store_id_input,order_id_value,order_number_value,customer_name_value,customer_phone_value,address_value,
    case when s.delivery_enabled and nullif(order_payload->>'area_id','') is not null then (order_payload->>'area_id')::uuid else null end,
    area_name_value,subtotal,delivery,final_total,notes_value,
    case when s.scheduled_orders_enabled then requested_time_value else '' end,
    case when s.scheduled_orders_enabled then requested_for_value else null end,
    nullif(client_token_value,''),'جديد'
  );

  for item in select * from jsonb_array_elements(items_payload) loop
    q:=(item->>'quantity')::numeric;
    select * into p from public.products where store_id=store_id_input and id=(item->>'product_id')::uuid for update;
    select * into o from public.product_options where store_id=store_id_input and id=(item->>'option_id')::uuid and product_id=p.id for update;
    line_total:=o.price*q;

    insert into public.order_items(store_id,id,order_id,product_id,product_name,option_id,option_name,unit_price,quantity,line_total)
    values(store_id_input,(item->>'id')::uuid,order_id_value,p.id,p.name_ar,o.id,o.name_ar,o.price,q,line_total);

    if p.track_stock then update public.products set stock_qty=greatest(0,coalesce(stock_qty,0)-q),updated_at=now() where store_id=store_id_input and id=p.id; end if;
    if o.track_stock then update public.product_options set stock_qty=greatest(0,coalesce(stock_qty,0)-q) where store_id=store_id_input and id=o.id; end if;
  end loop;

  perform public.log_order_event(order_id_value,'created','تم إنشاء الطلب');

  return jsonb_build_object(
    'ok',true,'duplicate',false,'order_id',order_id_value,'order_number',order_number_value,
    'product_subtotal',subtotal,'delivery_fee',delivery,'total',final_total,
    'area_name',area_name_value,
    'requested_time',case when s.scheduled_orders_enabled then requested_time_value else '' end,
    'items',result_items
  );
end;
$$;

create or replace function public.create_store_order(order_payload jsonb,items_payload jsonb)
returns jsonb
language sql
security definer
set search_path=pg_catalog,public
as $$
  select public.create_store_order(public.default_store_id(),order_payload,items_payload);
$$;

create or replace function public.claim_order_tracking(order_id_input uuid,client_token_input text)
returns text
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare current_tracking text; current_client text;
begin
  if coalesce(btrim(client_token_input),'')='' then raise exception 'بيانات التتبع غير صحيحة'; end if;
  select tracking_token,client_token into current_tracking,current_client
  from public.orders where id=order_id_input for update;
  if not found or coalesce(current_client,'')<>left(btrim(client_token_input),100) then raise exception 'تعذر إنشاء رابط التتبع'; end if;
  if coalesce(current_tracking,'')='' then
    current_tracking:=lower(encode(gen_random_bytes(18),'hex'));
    update public.orders set tracking_token=current_tracking where id=order_id_input;
  end if;
  return current_tracking;
end;
$$;

create or replace function public.get_public_order_tracking(tracking_token_input text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare ord public.orders%rowtype; events_value jsonb;
begin
  if length(coalesce(btrim(tracking_token_input),''))<20 then raise exception 'رابط التتبع غير صحيح'; end if;
  select * into ord from public.orders
  where tracking_token=btrim(tracking_token_input) and archived_at is null;
  if ord.id is null then raise exception 'تعذر العثور على الطلب'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('created_at',x.created_at,'summary',x.summary) order by x.created_at),'[]'::jsonb)
  into events_value
  from (
    select created_at,summary from public.order_events
    where store_id=ord.store_id and order_id=ord.id and event_type in ('created','status')
    order by created_at desc limit 30
  ) x;

  return jsonb_build_object(
    'order_number',ord.order_number,'created_at',ord.created_at,'status',ord.status,
    'requested_time',ord.requested_time,'total',ord.total,'events',events_value
  );
end;
$$;

create or replace function public.record_store_visit(store_id_input uuid,country_input text,device_input text,referrer_input text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare retention_days integer:=180;
begin
  if not exists(select 1 from public.stores where id=store_id_input and status='active') then return false; end if;

  insert into public.site_visit_daily(store_id,day,country_code,device_type,visits)
  values(
    store_id_input,current_date,
    left(coalesce(nullif(btrim(country_input),''),'غير معروف'),32),
    case when device_input in ('هاتف','جهاز لوحي','كمبيوتر') then device_input else 'كمبيوتر' end,
    1
  )
  on conflict(store_id,day,country_code,device_type) do update
  set visits=public.site_visit_daily.visits+1;

  select coalesce(visit_retention_days,180) into retention_days
  from public.shop_settings where store_id=store_id_input limit 1;

  delete from public.site_visit_daily
  where store_id=store_id_input
    and day < current_date-greatest(30,least(3650,retention_days));
  return true;
end;
$$;

create or replace function public.record_store_visit(country_input text,device_input text,referrer_input text)
returns boolean
language sql
security definer
set search_path=pg_catalog,public
as $$
  select public.record_store_visit(public.default_store_id(),country_input,device_input,referrer_input);
$$;

create or replace function public.log_client_error(store_id_input uuid,message_input text,path_input text,source_input text default 'frontend')
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if length(btrim(coalesce(message_input,'')))=0 then return false; end if;
  if not exists(select 1 from public.stores where id=store_id_input) then return false; end if;

  insert into public.client_error_log(store_id,message,path,source)
  values(store_id_input,left(btrim(message_input),500),left(coalesce(path_input,''),240),left(coalesce(source_input,'frontend'),60));

  delete from public.client_error_log
  where store_id=store_id_input and created_at < now()-interval '30 days';

  delete from public.client_error_log
  where store_id=store_id_input and id in (
    select id from public.client_error_log
    where store_id=store_id_input
    order by created_at desc
    offset 1000
  );
  return true;
end;
$$;

create or replace function public.log_client_error(message_input text,path_input text,source_input text default 'frontend')
returns boolean
language sql
security definer
set search_path=pg_catalog,public
as $$
  select public.log_client_error(public.default_store_id(),message_input,path_input,source_input);
$$;

grant execute on function public.apply_due_scheduled_prices(uuid) to anon,authenticated;
grant execute on function public.create_store_order(uuid,jsonb,jsonb) to anon,authenticated;
grant execute on function public.claim_order_tracking(uuid,text) to anon,authenticated;
grant execute on function public.get_public_order_tracking(text) to anon,authenticated;
grant execute on function public.record_store_visit(uuid,text,text,text) to anon,authenticated;
grant execute on function public.log_client_error(uuid,text,text,text) to anon,authenticated;
