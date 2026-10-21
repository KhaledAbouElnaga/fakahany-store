-- متجر الفكهاني - مخطط قاعدة البيانات الكامل لـ Supabase
-- الصق الملف كله مرة واحدة داخل SQL Editor ثم اضغط Run.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  display_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.selling_units (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  description_ar text not null default '',
  image_url text not null default '',
  image_urls text[] default '{}',
  category_id uuid references public.categories(id) on delete set null,
  featured boolean not null default false,
  available boolean not null default true,
  hidden boolean not null default false,
  track_stock boolean not null default false,
  stock_qty numeric,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name_ar text not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  old_price numeric(12,2) check (old_price is null or old_price >= 0),
  available boolean not null default true,
  track_stock boolean not null default false,
  stock_qty numeric,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_settings (
  id text primary key default 'main',
  store_name text not null default 'سوق الطازج',
  site_name text not null default 'سوق الطازج',
  logo_url text not null default '',
  banner_url text not null default '',
  hero_title text not null default 'الطازج لحد باب بيتك',
  hero_subtitle text not null default 'أفضل الفواكه والخضروات الطازجة وتوصيل سريع للبيت',
  phone text not null default '',
  whatsapp_number text not null default '',
  address text not null default '',
  welcome_message text not null default 'أهلاً بك',
  min_order numeric(12,2) not null default 50 check (min_order >= 0),
  default_delivery_fee numeric(12,2) not null default 15 check (default_delivery_fee >= 0),
  opening_time text not null default '09:00',
  closing_time text not null default '23:00',
  working_days text[] not null default array['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'],
  manual_open boolean not null default true,
  show_search boolean not null default true,
  show_categories boolean not null default true,
  show_featured boolean not null default true,
  show_offers boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  enabled boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key,
  order_number text not null unique,
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  area_id uuid references public.delivery_areas(id) on delete set null,
  area_name text not null default '',
  product_subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text not null default '',
  status text not null default 'جديد' check (status in ('جديد','جاري التجهيز','خرج للتوصيل','مكتمل','ملغي'))
);

create table if not exists public.order_items (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  option_id uuid references public.product_options(id) on delete set null,
  option_name text not null,
  unit_price numeric(12,2) not null default 0,
  quantity numeric(12,2) not null default 1,
  line_total numeric(12,2) not null default 0
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.admin_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admins);
$$;

grant execute on function public.admin_exists() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.claim_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  if exists(select 1 from public.admins) then
    if exists(select 1 from public.admins where user_id = auth.uid()) then
      return true;
    end if;
    raise exception 'تم تعيين المدير الأول بالفعل';
  end if;
  insert into public.admins(user_id) values(auth.uid());
  return true;
end;
$$;

grant execute on function public.claim_first_admin() to authenticated;

alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.selling_units enable row level security;
alter table public.products enable row level security;
alter table public.product_options enable row level security;
alter table public.shop_settings enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- تنظيف السياسات إذا شغلت الملف أكثر من مرة
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('admins','categories','selling_units','products','product_options','shop_settings','delivery_areas','orders','order_items') LOOP
    EXECUTE format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

create policy "admins can read own role" on public.admins for select using (user_id = auth.uid() or public.is_admin());

create policy "public reads visible categories" on public.categories for select using (visible or public.is_admin());
create policy "admins manage categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy "public reads active units" on public.selling_units for select using (active or public.is_admin());
create policy "admins manage units" on public.selling_units for all using (public.is_admin()) with check (public.is_admin());

create policy "public reads visible products" on public.products for select using ((not hidden) or public.is_admin());
create policy "admins manage products" on public.products for all using (public.is_admin()) with check (public.is_admin());

create policy "public reads options" on public.product_options for select using (
  public.is_admin() or exists(select 1 from public.products p where p.id = product_id and not p.hidden)
);
create policy "admins manage options" on public.product_options for all using (public.is_admin()) with check (public.is_admin());

create policy "public reads settings" on public.shop_settings for select using (true);
create policy "admins manage settings" on public.shop_settings for all using (public.is_admin()) with check (public.is_admin());

create policy "public reads enabled areas" on public.delivery_areas for select using (enabled or public.is_admin());
create policy "admins manage areas" on public.delivery_areas for all using (public.is_admin()) with check (public.is_admin());

create policy "customers create orders" on public.orders for insert to anon, authenticated with check (true);
create policy "admins read orders" on public.orders for select using (public.is_admin());
create policy "admins update orders" on public.orders for update using (public.is_admin()) with check (public.is_admin());
create policy "admins delete orders" on public.orders for delete using (public.is_admin());

create policy "customers create order items" on public.order_items for insert to anon, authenticated with check (true);
create policy "admins read order items" on public.order_items for select using (public.is_admin());
create policy "admins update order items" on public.order_items for update using (public.is_admin()) with check (public.is_admin());
create policy "admins delete order items" on public.order_items for delete using (public.is_admin());

insert into public.shop_settings(id) values ('main') on conflict (id) do nothing;

insert into public.categories(name_ar, display_order, visible)
select * from (values ('فواكه',1,true),('خضروات',2,true),('ورقيات',3,true),('عروض',4,true)) as v(name_ar,display_order,visible)
where not exists (select 1 from public.categories);

insert into public.selling_units(name_ar, display_order, active)
select * from (values ('كيلو',1,true),('نصف كيلو',2,true),('ربع كيلو',3,true),('قطعة',4,true),('عبوة',5,true),('ربطة',6,true)) as v(name_ar,display_order,active)
where not exists (select 1 from public.selling_units);

insert into public.delivery_areas(name_ar, fee, enabled, display_order)
select * from (values ('المنصورة',15,true,1),('طلخا',20,true,2)) as v(name_ar,fee,enabled,display_order)
where not exists (select 1 from public.delivery_areas);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-images','store-images',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname like 'fakahany_%' LOOP
    EXECUTE format('drop policy if exists %I on storage.objects', r.policyname);
  END LOOP;
END $$;

create policy "fakahany_public_read_images" on storage.objects for select using (bucket_id='store-images');
create policy "fakahany_admin_upload_images" on storage.objects for insert to authenticated with check (bucket_id='store-images' and public.is_admin());
create policy "fakahany_admin_update_images" on storage.objects for update to authenticated using (bucket_id='store-images' and public.is_admin()) with check (bucket_id='store-images' and public.is_admin());
create policy "fakahany_admin_delete_images" on storage.objects for delete to authenticated using (bucket_id='store-images' and public.is_admin());
