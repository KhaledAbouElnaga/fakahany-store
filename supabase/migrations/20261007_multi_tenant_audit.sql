-- Tenant-aware audit and data retention.

create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  row_data jsonb;
  entity_id_value text:='';
  label_value text:='';
  retention_days integer:=180;
  sid uuid;
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  sid:=nullif(row_data->>'store_id','')::uuid;

  if sid is null or not exists(
    select 1 from public.staff_profiles s
    where s.user_id=auth.uid() and s.store_id=sid and s.active=true
  ) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name='staff_profiles' and tg_op='UPDATE'
     and (to_jsonb(new)-'last_login_at'-'updated_at')=(to_jsonb(old)-'last_login_at'-'updated_at') then
    return new;
  end if;

  entity_id_value:=coalesce(row_data->>'id',row_data->>'user_id','');
  label_value:=left(coalesce(
    row_data->>'name_ar',
    row_data->>'display_name',
    row_data->>'email',
    row_data->>'name',
    row_data->>'store_name',
    entity_id_value
  ),180);

  insert into public.admin_audit_log(store_id,actor_user_id,action,entity_type,entity_id,label)
  values(sid,auth.uid(),lower(tg_op),tg_table_name,entity_id_value,label_value);

  select coalesce(audit_retention_days,180) into retention_days
  from public.shop_settings where store_id=sid limit 1;

  delete from public.admin_audit_log
  where store_id=sid
    and created_at < now()-(greatest(30,least(3650,retention_days))*interval '1 day');

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.run_data_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  s public.shop_settings%rowtype;
  audit_count integer:=0;
  inventory_count integer:=0;
  visits_count integer:=0;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  select * into s from public.shop_settings where store_id=sid limit 1;

  delete from public.admin_audit_log
  where store_id=sid
    and created_at < now()-(greatest(30,least(3650,coalesce(s.audit_retention_days,180)))*interval '1 day');
  get diagnostics audit_count=row_count;

  delete from public.inventory_adjustments
  where store_id=sid
    and created_at < now()-(greatest(30,least(3650,coalesce(s.inventory_retention_days,365)))*interval '1 day');
  get diagnostics inventory_count=row_count;

  delete from public.site_visit_daily
  where store_id=sid
    and day < current_date-greatest(30,least(3650,coalesce(s.visit_retention_days,180)));
  get diagnostics visits_count=row_count;

  return jsonb_build_object(
    'audit_deleted',audit_count,
    'inventory_deleted',inventory_count,
    'visits_deleted',visits_count
  );
end;
$$;
