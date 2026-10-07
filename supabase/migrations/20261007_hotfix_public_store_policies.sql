-- Hotfix: public storefront policies must not query public.stores directly.
-- Anonymous visitors do not have SELECT on stores, so those policy subqueries fail.
-- Use narrow SECURITY DEFINER helpers instead and keep stores private.

create or replace function public.store_is_active(store_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.stores s
    where s.id=store_id_input
      and s.status='active'
  );
$$;

create or replace function public.product_is_public(store_id_input uuid,product_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.products p
    where p.id=product_id_input
      and p.store_id=store_id_input
      and not p.hidden
  );
$$;

revoke all on function public.store_is_active(uuid) from public;
revoke all on function public.product_is_public(uuid,uuid) from public;
grant execute on function public.store_is_active(uuid) to anon,authenticated;
grant execute on function public.product_is_public(uuid,uuid) to anon,authenticated;

drop policy if exists "public reads visible categories" on public.categories;
create policy "public reads visible categories" on public.categories
for select
using(
  (visible and public.store_is_active(store_id))
  or public.is_staff_for_store(store_id)
);

drop policy if exists "public reads active units" on public.selling_units;
create policy "public reads active units" on public.selling_units
for select
using(
  (active and public.store_is_active(store_id))
  or public.is_staff_for_store(store_id)
);

drop policy if exists "public reads visible products" on public.products;
create policy "public reads visible products" on public.products
for select
using(
  ((not hidden) and public.store_is_active(store_id))
  or public.is_staff_for_store(store_id)
);

drop policy if exists "public reads options" on public.product_options;
create policy "public reads options" on public.product_options
for select
using(
  (
    public.store_is_active(store_id)
    and public.product_is_public(store_id,product_id)
  )
  or public.is_staff_for_store(store_id)
);

drop policy if exists "public reads settings" on public.shop_settings;
create policy "public reads settings" on public.shop_settings
for select
using(
  public.store_is_active(store_id)
  or public.is_staff_for_store(store_id)
);

drop policy if exists "public reads enabled areas" on public.delivery_areas;
create policy "public reads enabled areas" on public.delivery_areas
for select
using(
  (enabled and public.store_is_active(store_id))
  or public.is_staff_for_store(store_id)
);
