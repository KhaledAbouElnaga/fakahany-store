-- Automated daily operational backups using Supabase Cron.

create extension if not exists pg_cron;

alter table public.platform_store_backups drop constraint if exists platform_store_backups_kind_check;
alter table public.platform_store_backups
  add constraint platform_store_backups_kind_check
  check (kind in ('manual','scheduled','pre_restore','pre_delete'));

create or replace function public.system_create_store_backup(
  store_id_input uuid,
  label_input text,
  kind_input text,
  created_by_input uuid
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  st public.stores%rowtype;
  snapshot_value jsonb;
  backup_id uuid;
  kind_value text:=coalesce(nullif(kind_input,''),'manual');
begin
  if kind_value not in ('manual','scheduled','pre_restore','pre_delete') then
    raise exception 'نوع النسخة غير صحيح';
  end if;

  select * into st from public.stores where id=store_id_input and archived_at is null;
  if st.id is null then raise exception 'المتجر غير موجود'; end if;

  select jsonb_build_object(
    'schema_version',1,
    'captured_at',now(),
    'store',jsonb_build_object('id',st.id,'slug',st.slug,'name',st.name,'plan',st.plan,'status',st.status),
    'settings',coalesce((select to_jsonb(x) from public.shop_settings x where x.store_id=st.id limit 1),'{}'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.categories x where x.store_id=st.id),'[]'::jsonb),
    'units',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.selling_units x where x.store_id=st.id),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.products x where x.store_id=st.id),'[]'::jsonb),
    'product_options',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.product_options x where x.store_id=st.id),'[]'::jsonb),
    'delivery_areas',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.delivery_areas x where x.store_id=st.id),'[]'::jsonb),
    'order_statuses',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.order_statuses x where x.store_id=st.id),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.orders x where x.store_id=st.id),'[]'::jsonb),
    'order_items',coalesce((select jsonb_agg(to_jsonb(x) order by x.order_id,x.id) from public.order_items x where x.store_id=st.id),'[]'::jsonb),
    'scheduled_prices',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at,x.id) from public.scheduled_prices x where x.store_id=st.id),'[]'::jsonb),
    'inventory_adjustments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.inventory_adjustments x where x.store_id=st.id),'[]'::jsonb),
    'order_events',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.order_events x where x.store_id=st.id),'[]'::jsonb)
  ) into snapshot_value;

  insert into public.platform_store_backups(store_id,store_slug,store_name,kind,label,snapshot,created_by)
  values(st.id,st.slug,st.name,kind_value,left(coalesce(label_input,''),180),snapshot_value,created_by_input)
  returning id into backup_id;

  delete from public.platform_store_backups
  where id in (
    select id from public.platform_store_backups
    where store_slug=st.slug
    order by created_at desc
    offset 12
  );

  return backup_id;
end;
$$;

create or replace function public.platform_create_backup(
  store_id_input uuid,
  label_input text default '',
  kind_input text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare backup_id uuid; st public.stores%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  select * into st from public.stores where id=store_id_input;
  if st.id is null then raise exception 'المتجر غير موجود'; end if;

  backup_id:=public.system_create_store_backup(store_id_input,label_input,kind_input,auth.uid());
  perform public.platform_write_audit(st.id,'backup_create',coalesce(nullif(label_input,''),'نسخة احتياطية'),jsonb_build_object('backup_id',backup_id,'kind',kind_input));

  return jsonb_build_object('id',backup_id,'store_id',st.id,'store_slug',st.slug,'created_at',now(),'kind',kind_input);
end;
$$;

create or replace function public.run_daily_store_backups()
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  st record;
  latest timestamptz;
  created_count integer:=0;
begin
  for st in select id,name from public.stores where archived_at is null and status='active' loop
    select max(created_at) into latest
    from public.platform_store_backups
    where store_id=st.id;

    if latest is null or latest<now()-interval '20 hours' then
      perform public.system_create_store_backup(st.id,'نسخة يومية تلقائية','scheduled',null);
      created_count:=created_count+1;
    end if;
  end loop;
  return created_count;
end;
$$;

revoke all on function public.system_create_store_backup(uuid,text,text,uuid) from public;
revoke all on function public.run_daily_store_backups() from public;
revoke execute on function public.system_create_store_backup(uuid,text,text,uuid) from anon,authenticated;
revoke execute on function public.run_daily_store_backups() from anon,authenticated;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='fakahany-daily-store-backups' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'fakahany-daily-store-backups',
    '30 2 * * *',
    'select public.run_daily_store_backups();'
  );
end $$;

select 'DAILY BACKUPS SCHEDULED' as result;
