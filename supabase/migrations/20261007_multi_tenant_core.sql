-- Multi-tenant SaaS core schema.
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  custom_domain text unique,
  status text not null default 'active' check (status in ('active','suspended')),
  plan text not null default 'standard',
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$')
);

insert into public.stores(slug,name,owner_user_id)
select 'osama',
  coalesce((select store_name from public.shop_settings where id='main' limit 1),'الحاج أسامة'),
  (select user_id from public.staff_profiles where role='owner' and active=true order by created_at limit 1)
where not exists(select 1 from public.stores);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.platform_admins(user_id)
select user_id from public.staff_profiles
where role='owner' and active=true
order by created_at
limit 1
on conflict(user_id) do nothing;

create or replace function public.default_store_id()
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select id from public.stores order by created_at,id limit 1;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'admins','categories','selling_units','products','product_options','shop_settings',
    'delivery_areas','orders','order_items','site_visits','order_cleanup_security',
    'order_cleanup_logs','order_statuses','staff_profiles','staff_invites','order_events',
    'inventory_adjustments','scheduled_prices','site_visit_daily','admin_audit_log','client_error_log'
  ]
  loop
    execute format('alter table public.%I add column if not exists store_id uuid',t);
    execute format('update public.%I set store_id=public.default_store_id() where store_id is null',t);
    execute format('alter table public.%I alter column store_id set default public.default_store_id()',t);
    execute format('alter table public.%I alter column store_id set not null',t);
    if not exists(select 1 from pg_constraint where conrelid=('public.'||t)::regclass and contype='f' and conname=t||'_store_id_fkey') then
      execute format('alter table public.%I add constraint %I foreign key(store_id) references public.stores(id) on delete cascade',t,t||'_store_id_fkey');
    end if;
  end loop;
end $$;

alter table public.orders drop constraint if exists orders_order_number_key;
create unique index if not exists uq_orders_store_order_number on public.orders(store_id,order_number);

alter table public.order_statuses drop constraint if exists order_statuses_name_key;
create unique index if not exists uq_order_statuses_store_name on public.order_statuses(store_id,name);

alter table public.site_visit_daily drop constraint if exists site_visit_daily_pkey;
alter table public.site_visit_daily add constraint site_visit_daily_pkey primary key(store_id,day,country_code,device_type);

alter table public.staff_invites drop constraint if exists staff_invites_role_check;
alter table public.staff_invites add constraint staff_invites_role_check check (role in ('owner','manager','orders','inventory','viewer'));

create index if not exists idx_categories_store on public.categories(store_id,display_order);
create index if not exists idx_units_store on public.selling_units(store_id,display_order);
create index if not exists idx_products_store on public.products(store_id,display_order);
create index if not exists idx_options_store on public.product_options(store_id,product_id,display_order);
create index if not exists idx_areas_store on public.delivery_areas(store_id,display_order);
create index if not exists idx_orders_store_created on public.orders(store_id,created_at desc);
create index if not exists idx_order_items_store_order on public.order_items(store_id,order_id);
create index if not exists idx_status_store_order on public.order_statuses(store_id,display_order);
create index if not exists idx_staff_store on public.staff_profiles(store_id,created_at);
create index if not exists idx_invites_store on public.staff_invites(store_id,created_at);
create index if not exists idx_events_store_order on public.order_events(store_id,order_id,created_at desc);
create index if not exists idx_inventory_store_created on public.inventory_adjustments(store_id,created_at desc);
create index if not exists idx_prices_store_starts on public.scheduled_prices(store_id,starts_at);
create index if not exists idx_audit_store_created on public.admin_audit_log(store_id,created_at desc);
create index if not exists idx_errors_store_created on public.client_error_log(store_id,created_at desc);
