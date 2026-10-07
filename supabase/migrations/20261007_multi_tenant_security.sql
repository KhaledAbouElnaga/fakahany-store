-- Multi-tenant security helpers and row-level isolation.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select auth.uid() is not null
    and exists(select 1 from public.platform_admins p where p.user_id=auth.uid());
$$;

create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select s.store_id
  from public.staff_profiles s
  where s.user_id=auth.uid() and s.active=true
  limit 1;
$$;

create or replace function public.is_staff_for_store(store_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select auth.uid() is not null and exists(
    select 1 from public.staff_profiles s
    where s.user_id=auth.uid() and s.active=true and s.store_id=store_id_input
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select auth.uid() is not null and exists(
    select 1 from public.staff_profiles s
    where s.user_id=auth.uid() and s.active=true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1 from public.staff_profiles s
    where s.user_id=auth.uid() and s.active=true and s.role='owner'
  )
  and (
    not exists(
      select 1 from auth.mfa_factors f
      where f.user_id=auth.uid() and f.status='verified'
    )
    or coalesce(auth.jwt()->>'aal','aal1')='aal2'
  );
$$;

create or replace function public.has_permission(permission_input text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1 from public.staff_profiles s
    where s.user_id=auth.uid()
      and s.active=true
      and (s.role='owner' or '*'=any(s.permissions) or permission_input=any(s.permissions))
  );
$$;

create or replace function public.current_staff_profile()
returns public.staff_profiles
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select * from public.staff_profiles
  where user_id=auth.uid() and active=true
  limit 1;
$$;

create or replace function public.resolve_store_context(host_input text, slug_input text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  host_value text:=lower(split_part(coalesce(host_input,''),':',1));
  requested_slug text:=lower(btrim(coalesce(slug_input,'')));
  first_label text;
  s public.stores%rowtype;
begin
  host_value:=regexp_replace(host_value,'^www\.','','i');
  first_label:=split_part(host_value,'.',1);

  if requested_slug<>'' then
    select * into s from public.stores where slug=requested_slug limit 1;
  end if;

  if s.id is null and host_value<>'' then
    select * into s from public.stores
    where lower(coalesce(custom_domain,''))=host_value
    limit 1;
  end if;

  if s.id is null and first_label<>'' then
    select * into s from public.stores where slug=first_label limit 1;
  end if;

  if s.id is null and (
    host_value in ('','localhost','127.0.0.1','fakahany-store.pages.dev')
    or host_value like '%.pages.dev'
  ) then
    select * into s from public.stores where id=public.default_store_id();
  end if;

  if s.id is null then return null; end if;

  return jsonb_build_object(
    'id',s.id,'slug',s.slug,'name',s.name,'custom_domain',s.custom_domain,
    'status',s.status,'plan',s.plan
  );
end;
$$;

revoke all on function public.resolve_store_context(text,text) from public;
grant execute on function public.resolve_store_context(text,text) to anon,authenticated;

do $$
declare r record;
begin
  for r in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public'
      and tablename in (
        'admins','categories','selling_units','products','product_options','shop_settings',
        'delivery_areas','orders','order_items','site_visits','order_cleanup_security',
        'order_cleanup_logs','order_statuses','staff_profiles','staff_invites','order_events',
        'inventory_adjustments','scheduled_prices','site_visit_daily','admin_audit_log','client_error_log',
        'stores','platform_admins'
      )
  loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

alter table public.stores enable row level security;
alter table public.platform_admins enable row level security;

create policy "platform admins read stores" on public.stores
for select to authenticated using(public.is_platform_admin());
create policy "platform admins manage stores" on public.stores
for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy "platform admin reads self" on public.platform_admins
for select to authenticated using(user_id=auth.uid());

create policy "public reads visible categories" on public.categories
for select using(
  (visible and exists(select 1 from public.stores s where s.id=store_id and s.status='active'))
  or public.is_staff_for_store(store_id)
);
create policy "staff insert categories" on public.categories for insert to authenticated
with check(store_id=public.current_store_id() and public.has_permission('products.manage'));
create policy "staff update categories" on public.categories for update to authenticated
using(store_id=public.current_store_id() and public.has_permission('products.manage'))
with check(store_id=public.current_store_id() and public.has_permission('products.manage'));
create policy "staff delete categories" on public.categories for delete to authenticated
using(store_id=public.current_store_id() and public.has_permission('products.manage'));

create policy "public reads active units" on public.selling_units
for select using(
  (active and exists(select 1 from public.stores s where s.id=store_id and s.status='active'))
  or public.is_staff_for_store(store_id)
);
create policy "staff insert units" on public.selling_units for insert to authenticated
with check(store_id=public.current_store_id() and public.has_permission('products.manage'));
create policy "staff update units" on public.selling_units for update to authenticated
using(store_id=public.current_store_id() and public.has_permission('products.manage'))
with check(store_id=public.current_store_id() and public.has_permission('products.manage'));
create policy "staff delete units" on public.selling_units for delete to authenticated
using(store_id=public.current_store_id() and public.has_permission('products.manage'));

create policy "public reads visible products" on public.products
for select using(
  ((not hidden) and exists(select 1 from public.stores s where s.id=store_id and s.status='active'))
  or public.is_staff_for_store(store_id)
);
create policy "staff insert products" on public.products for insert to authenticated
with check(store_id=public.current_store_id() and public.has_permission('products.manage'));
create policy "staff update products" on public.products for update to authenticated
using(store_id=public.current_store_id() and public.has_permission('products.manage'))
with check(store_id=public.current_store_id() and public.has_permission('products.manage'));
create policy "staff delete products" on public.products for delete to authenticated
using(store_id=public.current_store_id() and public.has_permission('products.manage'));

create policy "public reads options" on public.product_options
for select using(
  (
    exists(select 1 from public.stores s where s.id=store_id and s.status='active')
    and exists(select 1 from public.products p where p.id=product_id and p.store_id=store_id and not p.hidden)
  )
  or public.is_staff_for_store(store_id)
);
create policy "staff insert options" on public.product_options for insert to authenticated
with check(store_id=public.current_store_id() and public.has_permission('products.manage'));
create policy "staff update options" on public.product_options for update to authenticated
using(store_id=public.current_store_id() and public.has_permission('products.manage'))
with check(store_id=public.current_store_id() and public.has_permission('products.manage'));
create policy "staff delete options" on public.product_options for delete to authenticated
using(store_id=public.current_store_id() and public.has_permission('products.manage'));

create policy "public reads settings" on public.shop_settings
for select using(
  exists(select 1 from public.stores s where s.id=store_id and s.status='active')
  or public.is_staff_for_store(store_id)
);
create policy "staff insert settings" on public.shop_settings for insert to authenticated
with check(store_id=public.current_store_id() and public.has_permission('settings.manage'));
create policy "staff update settings" on public.shop_settings for update to authenticated
using(store_id=public.current_store_id() and public.has_permission('settings.manage'))
with check(store_id=public.current_store_id() and public.has_permission('settings.manage'));
create policy "staff delete settings" on public.shop_settings for delete to authenticated
using(store_id=public.current_store_id() and public.has_permission('settings.manage'));

create policy "public reads enabled areas" on public.delivery_areas
for select using(
  (enabled and exists(select 1 from public.stores s where s.id=store_id and s.status='active'))
  or public.is_staff_for_store(store_id)
);
create policy "staff insert areas" on public.delivery_areas for insert to authenticated
with check(store_id=public.current_store_id() and public.has_permission('settings.manage'));
create policy "staff update areas" on public.delivery_areas for update to authenticated
using(store_id=public.current_store_id() and public.has_permission('settings.manage'))
with check(store_id=public.current_store_id() and public.has_permission('settings.manage'));
create policy "staff delete areas" on public.delivery_areas for delete to authenticated
using(store_id=public.current_store_id() and public.has_permission('settings.manage'));

create policy "staff read orders" on public.orders for select
using(store_id=public.current_store_id() and public.has_permission('orders.view'));
create policy "staff read order items" on public.order_items for select
using(store_id=public.current_store_id() and public.has_permission('orders.view'));
create policy "staff read order statuses" on public.order_statuses for select
using(store_id=public.current_store_id() and (public.has_permission('orders.view') or public.has_permission('settings.manage')));
create policy "staff manage order statuses" on public.order_statuses for all to authenticated
using(store_id=public.current_store_id() and public.has_permission('settings.manage'))
with check(store_id=public.current_store_id() and public.has_permission('settings.manage'));

create policy "staff read visits" on public.site_visits for select
using(store_id=public.current_store_id() and public.has_permission('reports.view'));
create policy "staff read daily visits" on public.site_visit_daily for select
using(store_id=public.current_store_id() and public.has_permission('reports.view'));
create policy "owner reads cleanup logs" on public.order_cleanup_logs for select
using(store_id=public.current_store_id() and public.is_admin());
create policy "deny cleanup security direct access" on public.order_cleanup_security for all
using(false) with check(false);

create policy "staff read own profile" on public.staff_profiles for select
using(user_id=auth.uid() or (store_id=public.current_store_id() and public.is_admin()));
create policy "owner manages staff profiles" on public.staff_profiles for all to authenticated
using(store_id=public.current_store_id() and public.is_admin())
with check(store_id=public.current_store_id() and public.is_admin());
create policy "owner reads invites" on public.staff_invites for select
using(store_id=public.current_store_id() and public.is_admin());

create policy "staff read order events" on public.order_events for select
using(store_id=public.current_store_id() and public.has_permission('orders.view'));
create policy "staff read inventory adjustments" on public.inventory_adjustments for select
using(store_id=public.current_store_id() and (public.has_permission('inventory.manage') or public.has_permission('reports.view')));
create policy "staff read scheduled prices" on public.scheduled_prices for select
using(store_id=public.current_store_id() and public.has_permission('prices.manage'));
create policy "owner reads audit log" on public.admin_audit_log for select
using(store_id=public.current_store_id() and public.is_admin());
create policy "owner reads client errors" on public.client_error_log for select
using(store_id=public.current_store_id() and public.is_admin());
create policy "admins read own role" on public.admins for select
using(user_id=auth.uid() and store_id=public.current_store_id());

do $$
declare r record;
begin
  for r in select policyname from pg_policies
    where schemaname='storage' and tablename='objects' and policyname like 'fakahany_%'
  loop
    execute format('drop policy if exists %I on storage.objects',r.policyname);
  end loop;
end $$;

create policy "fakahany_public_read_images" on storage.objects
for select using(bucket_id='store-images');

create policy "fakahany_staff_upload_images" on storage.objects
for insert to authenticated
with check(
  bucket_id='store-images'
  and (storage.foldername(name))[1]=public.current_store_id()::text
  and (public.has_permission('products.manage') or public.has_permission('settings.manage'))
);

create policy "fakahany_staff_update_images" on storage.objects
for update to authenticated
using(
  bucket_id='store-images'
  and (storage.foldername(name))[1]=public.current_store_id()::text
  and (public.has_permission('products.manage') or public.has_permission('settings.manage'))
)
with check(
  bucket_id='store-images'
  and (storage.foldername(name))[1]=public.current_store_id()::text
);

create policy "fakahany_staff_delete_images" on storage.objects
for delete to authenticated
using(
  bucket_id='store-images'
  and (storage.foldername(name))[1]=public.current_store_id()::text
  and (public.has_permission('products.manage') or public.has_permission('settings.manage'))
);
