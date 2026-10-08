-- DRAFT: subscription enforcement for public storefront and public-order writes.
-- No existing store data is updated. Do not deploy before tenant and trial-expiration tests.
-- Assumes subscription_status='trial' means trial_ends_at > now(),
-- and status='active' means paid_until > now() for active paid subscriptions.
-- Expired/past_due/paused subscriptions are deliberately not public.
-- IMPORTANT: operators must fill paid_until when manually setting subscriptions active.

CREATE OR REPLACE FUNCTION public.store_is_active(store_id_input uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT EXISTS (
   SELECT 1 FROM public.stores s
   WHERE s.id=store_id_input AND s.status='active'
   AND (
     (s.subscription_status='trial' AND s.trial_ends_at > now())
     OR (s.subscription_status='active' AND s.paid_until > now())
   )
 );
$function$;

-- Orders bypass RLS through SECURITY DEFINER; validate subscription within the RPC too.
CREATE OR REPLACE FUNCTION public.create_store_order(store_id_input uuid, order_payload jsonb, items_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  if store_id_input is null or not public.store_is_active(store_id_input) then
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
$function$
;
