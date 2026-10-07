-- Hotfix: keep staff permission checks out of anonymous SELECT policies.
-- Run after 20261003_operations_upgrades.sql.
-- Public storefront reads keep using the existing public SELECT policies.
-- Staff permissions are applied only to write operations.

drop policy if exists "staff manage categories" on public.categories;
drop policy if exists "staff manage units" on public.selling_units;
drop policy if exists "staff manage products" on public.products;
drop policy if exists "staff manage options" on public.product_options;
drop policy if exists "staff manage settings" on public.shop_settings;
drop policy if exists "staff manage areas" on public.delivery_areas;

drop policy if exists "staff insert categories" on public.categories;
drop policy if exists "staff update categories" on public.categories;
drop policy if exists "staff delete categories" on public.categories;
create policy "staff insert categories" on public.categories
for insert to authenticated with check (public.has_permission('products.manage'));
create policy "staff update categories" on public.categories
for update to authenticated using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy "staff delete categories" on public.categories
for delete to authenticated using (public.has_permission('products.manage'));

drop policy if exists "staff insert units" on public.selling_units;
drop policy if exists "staff update units" on public.selling_units;
drop policy if exists "staff delete units" on public.selling_units;
create policy "staff insert units" on public.selling_units
for insert to authenticated with check (public.has_permission('products.manage'));
create policy "staff update units" on public.selling_units
for update to authenticated using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy "staff delete units" on public.selling_units
for delete to authenticated using (public.has_permission('products.manage'));

drop policy if exists "staff insert products" on public.products;
drop policy if exists "staff update products" on public.products;
drop policy if exists "staff delete products" on public.products;
create policy "staff insert products" on public.products
for insert to authenticated with check (public.has_permission('products.manage'));
create policy "staff update products" on public.products
for update to authenticated using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy "staff delete products" on public.products
for delete to authenticated using (public.has_permission('products.manage'));

drop policy if exists "staff insert options" on public.product_options;
drop policy if exists "staff update options" on public.product_options;
drop policy if exists "staff delete options" on public.product_options;
create policy "staff insert options" on public.product_options
for insert to authenticated with check (public.has_permission('products.manage'));
create policy "staff update options" on public.product_options
for update to authenticated using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy "staff delete options" on public.product_options
for delete to authenticated using (public.has_permission('products.manage'));

drop policy if exists "staff insert settings" on public.shop_settings;
drop policy if exists "staff update settings" on public.shop_settings;
drop policy if exists "staff delete settings" on public.shop_settings;
create policy "staff insert settings" on public.shop_settings
for insert to authenticated with check (public.has_permission('settings.manage'));
create policy "staff update settings" on public.shop_settings
for update to authenticated using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy "staff delete settings" on public.shop_settings
for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "staff insert areas" on public.delivery_areas;
drop policy if exists "staff update areas" on public.delivery_areas;
drop policy if exists "staff delete areas" on public.delivery_areas;
create policy "staff insert areas" on public.delivery_areas
for insert to authenticated with check (public.has_permission('settings.manage'));
create policy "staff update areas" on public.delivery_areas
for update to authenticated using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy "staff delete areas" on public.delivery_areas
for delete to authenticated using (public.has_permission('settings.manage'));

select 'PUBLIC STOREFRONT RLS HOTFIX SUCCESS' as result;
