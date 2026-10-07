-- Tenant-aware admin search, inventory, and scheduled pricing.

create or replace function public.admin_global_search(query_input text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  q text:=btrim(coalesce(query_input,''));
  result jsonb:='[]'::jsonb;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_staff() then raise exception 'غير مصرح'; end if;
  if length(q)<2 then return result; end if;

  if public.has_permission('orders.view') then
    result:=result||coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind','order','id',id::text,'title','#'||order_number,
        'subtitle',trim(coalesce(customer_name,'')||' · '||coalesce(customer_phone,''))
      ))
      from (
        select id,order_number,customer_name,customer_phone
        from public.orders
        where store_id=sid and archived_at is null and (
          order_number ilike '%'||q||'%'
          or customer_name ilike '%'||q||'%'
          or customer_phone ilike '%'||q||'%'
        )
        order by created_at desc
        limit 8
      ) s
    ),'[]'::jsonb);
  end if;

  if public.has_permission('products.manage') or public.has_permission('inventory.manage') or public.has_permission('prices.manage') then
    result:=result||coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind','product','id',id::text,'title',name_ar,
        'subtitle',case when available then 'متاح' else 'غير متاح' end
      ))
      from (
        select id,name_ar,available
        from public.products
        where store_id=sid and (name_ar ilike '%'||q||'%' or description_ar ilike '%'||q||'%')
        order by display_order
        limit 8
      ) s
    ),'[]'::jsonb);
  end if;

  if public.is_admin() then
    result:=result||coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind','staff','id',user_id::text,
        'title',coalesce(nullif(display_name,''),email),
        'subtitle',coalesce(nullif(job_title,''),'موظف')||' · '||case when active then 'مفعل' else 'موقوف' end
      ))
      from (
        select user_id,email,display_name,job_title,active
        from public.staff_profiles
        where store_id=sid and (
          email ilike '%'||q||'%'
          or display_name ilike '%'||q||'%'
          or job_title ilike '%'||q||'%'
        )
        order by created_at
        limit 8
      ) s
    ),'[]'::jsonb);
  end if;

  return result;
end;
$$;

create or replace function public.record_inventory_adjustment(
  product_id_input uuid,
  option_id_input uuid,
  before_input numeric,
  after_input numeric,
  reason_input text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  p_name text:='';
  o_name text:='';
  retention_days integer:=365;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('inventory.manage') then raise exception 'غير مصرح'; end if;

  if product_id_input is not null then
    select name_ar into p_name from public.products where store_id=sid and id=product_id_input;
  end if;
  if option_id_input is not null then
    select name_ar into o_name from public.product_options where store_id=sid and id=option_id_input;
  end if;

  insert into public.inventory_adjustments(
    store_id,actor_user_id,product_id,product_name,option_id,option_name,
    quantity_before,quantity_after,delta,reason
  ) values(
    sid,auth.uid(),product_id_input,coalesce(p_name,''),option_id_input,coalesce(o_name,''),
    before_input,after_input,coalesce(after_input,0)-coalesce(before_input,0),
    left(coalesce(reason_input,'تعديل يدوي'),200)
  );

  select coalesce(inventory_retention_days,365) into retention_days
  from public.shop_settings where store_id=sid limit 1;

  delete from public.inventory_adjustments
  where store_id=sid
    and created_at < now()-(greatest(30,least(3650,retention_days))*interval '1 day');

  return true;
end;
$$;

create or replace function public.schedule_option_price(
  option_id_input uuid,
  price_input numeric,
  old_price_input numeric,
  starts_at_input timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  new_id uuid;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('prices.manage') then raise exception 'غير مصرح'; end if;
  if price_input<0 then raise exception 'السعر غير صحيح'; end if;
  if starts_at_input<=now() then raise exception 'اختر وقتًا في المستقبل'; end if;
  if not exists(select 1 from public.product_options where store_id=sid and id=option_id_input) then
    raise exception 'الخيار غير موجود';
  end if;

  delete from public.scheduled_prices where store_id=sid and product_option_id=option_id_input;

  insert into public.scheduled_prices(store_id,product_option_id,price,old_price,starts_at,created_by)
  values(sid,option_id_input,price_input,old_price_input,starts_at_input,auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.cancel_scheduled_price(id_input uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('prices.manage') then raise exception 'غير مصرح'; end if;
  delete from public.scheduled_prices where store_id=sid and id=id_input;
  return true;
end;
$$;
