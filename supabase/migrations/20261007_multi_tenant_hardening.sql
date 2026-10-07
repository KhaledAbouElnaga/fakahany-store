-- Multi-tenant final hardening: domain sync, missing indexes, and RLS init-plan improvements.

create index if not exists idx_admins_store on public.admins(store_id);
create index if not exists idx_cleanup_logs_store on public.order_cleanup_logs(store_id,created_at desc);
create index if not exists idx_cleanup_security_store on public.order_cleanup_security(store_id);
create index if not exists idx_settings_store on public.shop_settings(store_id);
create index if not exists idx_site_visits_store on public.site_visits(store_id,created_at desc);
create index if not exists idx_stores_owner on public.stores(owner_user_id);
create index if not exists idx_inventory_product on public.inventory_adjustments(product_id);
create index if not exists idx_inventory_option on public.inventory_adjustments(option_id);
create index if not exists idx_order_items_product on public.order_items(product_id);
create index if not exists idx_order_items_option on public.order_items(option_id);
create index if not exists idx_orders_area on public.orders(area_id);
create index if not exists idx_scheduled_option on public.scheduled_prices(product_option_id);

drop policy if exists "platform admin reads self" on public.platform_admins;
create policy "platform admin reads self" on public.platform_admins
for select to authenticated
using(user_id=(select auth.uid()));

drop policy if exists "staff read own profile" on public.staff_profiles;
create policy "staff read own profile" on public.staff_profiles
for select
using(user_id=(select auth.uid()) or (store_id=public.current_store_id() and public.is_admin()));

drop policy if exists "admins read own role" on public.admins;
create policy "admins read own role" on public.admins
for select
using(user_id=(select auth.uid()) and store_id=public.current_store_id());

create or replace function public.platform_set_store_domain(store_id_input uuid,domain_input text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare d text:=lower(btrim(coalesce(domain_input,'')));
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;

  d:=regexp_replace(d,'^https?://','','i');
  d:=regexp_replace(d,'/.*$','','');
  d:=regexp_replace(d,'^www\.','','i');
  if d='' then d:=null; end if;

  update public.stores
  set custom_domain=d,updated_at=now()
  where id=store_id_input;

  if not found then raise exception 'المتجر غير موجود'; end if;

  update public.shop_settings
  set public_site_url=case when d is null then '' else 'https://'||d end,
      updated_at=now()
  where store_id=store_id_input;

  return true;
end;
$$;

drop index if exists public.idx_orders_phone_created_at;
