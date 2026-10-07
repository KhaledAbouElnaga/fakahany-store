-- Productization/admin pack: setup wizard, themes, domain readiness,
-- audit trail, configurable retention, global admin search, and staff removal.

alter table public.shop_settings
  add column if not exists setup_completed boolean not null default false,
  add column if not exists theme_preset text not null default 'green'
    check (theme_preset in ('green','orange','navy','plum')),
  add column if not exists public_site_url text not null default '',
  add column if not exists order_alert_minutes integer not null default 15
    check (order_alert_minutes between 1 and 240),
  add column if not exists audit_retention_days integer not null default 180
    check (audit_retention_days between 30 and 3650),
  add column if not exists inventory_retention_days integer not null default 365
    check (inventory_retention_days between 30 and 3650),
  add column if not exists visit_retention_days integer not null default 180
    check (visit_retention_days between 30 and 3650);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  label text not null default ''
);

create index if not exists idx_admin_audit_log_created
  on public.admin_audit_log(created_at desc);

create index if not exists idx_admin_audit_log_actor
  on public.admin_audit_log(actor_user_id,created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists "owner reads admin audit log" on public.admin_audit_log;
create policy "owner reads admin audit log"
on public.admin_audit_log
for select to authenticated
using (public.is_admin());

revoke all on public.admin_audit_log from anon,authenticated;
grant select on public.admin_audit_log to authenticated;

create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_data jsonb;
  old_data jsonb;
  entity_id_value text:='';
  label_value text:='';
  retention_days integer:=180;
begin
  -- Ignore unauthenticated storefront writes and login timestamp-only changes.
  if auth.uid() is null then return coalesce(new,old); end if;
  if not exists(select 1 from public.staff_profiles s where s.user_id=auth.uid() and s.active=true) then
    return coalesce(new,old);
  end if;

  if tg_table_name='staff_profiles' and tg_op='UPDATE'
     and (to_jsonb(new)-'last_login_at'-'updated_at')=(to_jsonb(old)-'last_login_at'-'updated_at') then
    return new;
  end if;

  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  entity_id_value:=coalesce(row_data->>'id',row_data->>'user_id','');
  label_value:=left(coalesce(
    row_data->>'name_ar',
    row_data->>'display_name',
    row_data->>'email',
    row_data->>'name',
    row_data->>'store_name',
    entity_id_value
  ),180);

  insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,label)
  values(
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    entity_id_value,
    label_value
  );

  select coalesce(audit_retention_days,180) into retention_days
  from public.shop_settings where id='main';
  delete from public.admin_audit_log
  where created_at < now()-(greatest(30,least(3650,retention_days))*interval '1 day');

  return coalesce(new,old);
end;
$$;

revoke all on function public.audit_admin_change() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['products','categories','selling_units','delivery_areas','shop_settings','staff_profiles','order_statuses']
  loop
    execute format('drop trigger if exists trg_admin_audit_%I on public.%I',t,t);
    execute format('create trigger trg_admin_audit_%I after insert or update or delete on public.%I for each row execute function public.audit_admin_change()',t,t);
  end loop;
end $$;

create or replace function public.remove_staff_member(user_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_role text;
  target_email text;
begin
  if not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if user_id_input=auth.uid() then raise exception 'لا يمكنك حذف حسابك الحالي'; end if;

  select role,email into target_role,target_email
  from public.staff_profiles
  where user_id=user_id_input
  for update;

  if target_role is null then raise exception 'الحساب غير موجود'; end if;
  if target_role='owner' then raise exception 'لا يمكن حذف حساب مالك من هنا'; end if;

  delete from public.admins where user_id=user_id_input;
  delete from public.staff_profiles where user_id=user_id_input;
  delete from public.staff_invites where lower(email)=lower(coalesce(target_email,'')) and used_at is null;
  return true;
end;
$$;

revoke all on function public.remove_staff_member(uuid) from public;
grant execute on function public.remove_staff_member(uuid) to authenticated;

create or replace function public.admin_global_search(query_input text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  q text:=btrim(coalesce(query_input,''));
  result jsonb:='[]'::jsonb;
begin
  if not public.is_staff() then raise exception 'غير مصرح'; end if;
  if length(q)<2 then return result; end if;

  if public.has_permission('orders.view') then
    result:=result||coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind','order','id',id::text,
        'title','#'||order_number,
        'subtitle',trim(coalesce(customer_name,'')||' · '||coalesce(customer_phone,''))
      ))
      from (
        select id,order_number,customer_name,customer_phone
        from public.orders
        where archived_at is null and (
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
        'kind','product','id',id::text,
        'title',name_ar,
        'subtitle',case when available then 'متاح' else 'غير متاح' end
      ))
      from (
        select id,name_ar,available
        from public.products
        where name_ar ilike '%'||q||'%' or description_ar ilike '%'||q||'%'
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
        where email ilike '%'||q||'%'
           or display_name ilike '%'||q||'%'
           or job_title ilike '%'||q||'%'
        order by created_at
        limit 8
      ) s
    ),'[]'::jsonb);
  end if;

  return result;
end;
$$;

revoke all on function public.admin_global_search(text) from public;
grant execute on function public.admin_global_search(text) to authenticated;

create or replace function public.run_data_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  s public.shop_settings%rowtype;
  audit_count integer:=0;
  inventory_count integer:=0;
  visits_count integer:=0;
begin
  if not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  select * into s from public.shop_settings where id='main';

  delete from public.admin_audit_log
  where created_at < now()-(greatest(30,least(3650,coalesce(s.audit_retention_days,180)))*interval '1 day');
  get diagnostics audit_count=row_count;

  delete from public.inventory_adjustments
  where created_at < now()-(greatest(30,least(3650,coalesce(s.inventory_retention_days,365)))*interval '1 day');
  get diagnostics inventory_count=row_count;

  delete from public.site_visit_daily
  where day < current_date-greatest(30,least(3650,coalesce(s.visit_retention_days,180)));
  get diagnostics visits_count=row_count;

  return jsonb_build_object('audit_deleted',audit_count,'inventory_deleted',inventory_count,'visits_deleted',visits_count);
end;
$$;

revoke all on function public.run_data_retention_cleanup() from public;
grant execute on function public.run_data_retention_cleanup() to authenticated;

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
set search_path = pg_catalog, public
as $$
declare
  p_name text:='';
  o_name text:='';
  retention_days integer:=365;
begin
  if not public.has_permission('inventory.manage') then raise exception 'غير مصرح'; end if;
  if product_id_input is not null then select name_ar into p_name from public.products where id=product_id_input; end if;
  if option_id_input is not null then select name_ar into o_name from public.product_options where id=option_id_input; end if;

  insert into public.inventory_adjustments(
    actor_user_id,product_id,product_name,option_id,option_name,
    quantity_before,quantity_after,delta,reason
  ) values(
    auth.uid(),product_id_input,coalesce(p_name,''),option_id_input,coalesce(o_name,''),
    before_input,after_input,coalesce(after_input,0)-coalesce(before_input,0),left(coalesce(reason_input,'تعديل يدوي'),200)
  );

  select coalesce(inventory_retention_days,365) into retention_days from public.shop_settings where id='main';
  delete from public.inventory_adjustments
  where created_at < now()-(greatest(30,least(3650,retention_days))*interval '1 day');

  return true;
end;
$$;

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
declare retention_days integer:=180;
begin
  insert into public.site_visit_daily(day,country_code,device_type,visits)
  values(
    current_date,
    left(coalesce(nullif(btrim(country_input),''),'غير معروف'),32),
    case when device_input in ('هاتف','جهاز لوحي','كمبيوتر') then device_input else 'كمبيوتر' end,
    1
  )
  on conflict(day,country_code,device_type) do update
  set visits=public.site_visit_daily.visits+1;

  select coalesce(visit_retention_days,180) into retention_days from public.shop_settings where id='main';
  delete from public.site_visit_daily
  where day < current_date-greatest(30,least(3650,retention_days));
  return true;
end;
$$;

select 'PRODUCTIZATION ADMIN PACK MIGRATION SUCCESS' as result;
