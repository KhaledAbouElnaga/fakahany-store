-- Order cleanup, archive, protected deletion, and audit log
-- Run after 20261003_store_upgrades.sql

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create index if not exists idx_orders_archived_at on public.orders(archived_at);
create index if not exists idx_orders_created_at_cleanup on public.orders(created_at);

create table if not exists public.order_cleanup_security (
  id text primary key default 'main',
  password_hash text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.order_cleanup_security(id)
values ('main')
on conflict (id) do nothing;

create table if not exists public.order_cleanup_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_user_id uuid,
  action text not null check (action in ('archive','delete','restore')),
  filter_type text not null default '',
  filter_label text not null default '',
  date_from date,
  date_to date,
  orders_count integer not null default 0,
  min_order_created_at timestamptz,
  max_order_created_at timestamptz
);

create index if not exists idx_order_cleanup_logs_created_at
  on public.order_cleanup_logs(created_at desc);

alter table public.order_cleanup_security enable row level security;
alter table public.order_cleanup_logs enable row level security;

drop policy if exists "admins read cleanup logs" on public.order_cleanup_logs;
create policy "admins read cleanup logs"
on public.order_cleanup_logs
for select
using (public.is_admin());

revoke all on public.order_cleanup_security from anon, authenticated;
revoke all on public.order_cleanup_logs from anon, authenticated;
grant select on public.order_cleanup_logs to authenticated;

create or replace function public.order_cleanup_password_set()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  has_password boolean;
begin
  if not public.is_admin() then
    raise exception 'غير مصرح';
  end if;

  select coalesce(password_hash <> '', false)
  into has_password
  from public.order_cleanup_security
  where id='main';

  return coalesce(has_password,false);
end;
$$;

revoke all on function public.order_cleanup_password_set() from public;
grant execute on function public.order_cleanup_password_set() to authenticated;

create or replace function public.set_order_cleanup_password(password_input text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'غير مصرح';
  end if;

  if length(coalesce(password_input,'')) < 8 then
    raise exception 'كلمة مرور الحذف يجب أن تكون 8 أحرف على الأقل';
  end if;

  insert into public.order_cleanup_security(id,password_hash,updated_at,updated_by)
  values (
    'main',
    crypt(password_input, gen_salt('bf', 10)),
    now(),
    auth.uid()
  )
  on conflict (id) do update
  set password_hash=excluded.password_hash,
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by;

  return true;
end;
$$;

revoke all on function public.set_order_cleanup_password(text) from public;
grant execute on function public.set_order_cleanup_password(text) to authenticated;

create or replace function public.preview_order_cleanup(
  date_from_input date,
  date_to_input date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  total_count integer := 0;
  active_count integer := 0;
  archived_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'غير مصرح';
  end if;

  if date_from_input is null or date_to_input is null or date_from_input > date_to_input then
    raise exception 'الفترة المحددة غير صحيحة';
  end if;

  select
    count(*)::integer,
    count(*) filter (where archived_at is null)::integer,
    count(*) filter (where archived_at is not null)::integer
  into total_count,active_count,archived_count
  from public.orders
  where created_at >= date_from_input::timestamptz
    and created_at < (date_to_input + 1)::timestamptz;

  return jsonb_build_object(
    'count',total_count,
    'active_count',active_count,
    'archived_count',archived_count
  );
end;
$$;

revoke all on function public.preview_order_cleanup(date,date) from public;
grant execute on function public.preview_order_cleanup(date,date) to authenticated;

create or replace function public.cleanup_orders(
  action_input text,
  date_from_input date,
  date_to_input date,
  filter_type_input text,
  filter_label_input text,
  password_input text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  affected integer := 0;
  min_created timestamptz;
  max_created timestamptz;
  password_hash_value text;
begin
  if not public.is_admin() then
    raise exception 'غير مصرح';
  end if;

  if action_input not in ('archive','delete') then
    raise exception 'الإجراء غير صحيح';
  end if;

  if date_from_input is null or date_to_input is null or date_from_input > date_to_input then
    raise exception 'الفترة المحددة غير صحيحة';
  end if;

  if action_input='archive' then
    select min(created_at),max(created_at)
    into min_created,max_created
    from public.orders
    where created_at >= date_from_input::timestamptz
      and created_at < (date_to_input + 1)::timestamptz
      and archived_at is null;

    update public.orders
    set archived_at=now(),archived_by=auth.uid()
    where created_at >= date_from_input::timestamptz
      and created_at < (date_to_input + 1)::timestamptz
      and archived_at is null;

    get diagnostics affected = row_count;
  else
    select password_hash
    into password_hash_value
    from public.order_cleanup_security
    where id='main';

    if coalesce(password_hash_value,'') = '' then
      raise exception 'يجب تعيين كلمة مرور الحذف أولاً';
    end if;

    if crypt(coalesce(password_input,''),password_hash_value) <> password_hash_value then
      raise exception 'كلمة مرور الحذف غير صحيحة';
    end if;

    select min(created_at),max(created_at)
    into min_created,max_created
    from public.orders
    where created_at >= date_from_input::timestamptz
      and created_at < (date_to_input + 1)::timestamptz;

    delete from public.orders
    where created_at >= date_from_input::timestamptz
      and created_at < (date_to_input + 1)::timestamptz;

    get diagnostics affected = row_count;
  end if;

  insert into public.order_cleanup_logs(
    admin_user_id,action,filter_type,filter_label,date_from,date_to,
    orders_count,min_order_created_at,max_order_created_at
  )
  values (
    auth.uid(),
    action_input,
    left(coalesce(filter_type_input,''),40),
    left(coalesce(filter_label_input,''),180),
    date_from_input,
    date_to_input,
    affected,
    min_created,
    max_created
  );

  return jsonb_build_object('ok',true,'count',affected);
end;
$$;

revoke all on function public.cleanup_orders(text,date,date,text,text,text) from public;
grant execute on function public.cleanup_orders(text,date,date,text,text,text) to authenticated;

create or replace function public.restore_archived_order(order_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  order_created timestamptz;
  order_number_value text;
begin
  if not public.is_admin() then
    raise exception 'غير مصرح';
  end if;

  select created_at,order_number
  into order_created,order_number_value
  from public.orders
  where id=order_id_input and archived_at is not null
  for update;

  if order_created is null then
    raise exception 'الطلب المؤرشف غير موجود';
  end if;

  update public.orders
  set archived_at=null,archived_by=null
  where id=order_id_input;

  insert into public.order_cleanup_logs(
    admin_user_id,action,filter_type,filter_label,date_from,date_to,
    orders_count,min_order_created_at,max_order_created_at
  )
  values (
    auth.uid(),
    'restore',
    'single',
    'استرجاع الطلب #' || coalesce(order_number_value,''),
    order_created::date,
    order_created::date,
    1,
    order_created,
    order_created
  );

  return true;
end;
$$;

revoke all on function public.restore_archived_order(uuid) from public;
grant execute on function public.restore_archived_order(uuid) to authenticated;

select 'ORDER CLEANUP MIGRATION SUCCESS' as result;
