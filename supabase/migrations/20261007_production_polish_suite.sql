-- Production polish suite: feature flags, dashboard customization,
-- bounded client error logging, and MFA enforcement for owner privileges.

alter table public.shop_settings
  add column if not exists feature_flags jsonb not null default
    '{"tracking":true,"reports":true,"staff":true,"scheduled_prices":true,"inventory":true,"favorites":true,"reorder":true}'::jsonb,
  add column if not exists dashboard_widgets text[] not null default
    array['orders_today','new_orders','overdue','sales_today','sales_week','avg_order','repeat_customers','cancel_rate','top_product','peak_hour','low_stock'];

create table if not exists public.client_error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null,
  path text not null default '',
  source text not null default 'frontend'
);

create index if not exists idx_client_error_log_created
  on public.client_error_log(created_at desc);

alter table public.client_error_log enable row level security;

drop policy if exists "owner reads client errors" on public.client_error_log;
create policy "owner reads client errors"
on public.client_error_log
for select to authenticated
using (public.is_admin());

revoke all on public.client_error_log from anon,authenticated;
grant select on public.client_error_log to authenticated;

create or replace function public.log_client_error(
  message_input text,
  path_input text,
  source_input text default 'frontend'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if length(btrim(coalesce(message_input,'')))=0 then return false; end if;

  insert into public.client_error_log(message,path,source)
  values(
    left(btrim(message_input),500),
    left(coalesce(path_input,''),240),
    left(coalesce(source_input,'frontend'),60)
  );

  delete from public.client_error_log
  where created_at < now()-interval '30 days';

  delete from public.client_error_log
  where id in (
    select id from public.client_error_log
    order by created_at desc
    offset 1000
  );

  return true;
end;
$$;

revoke all on function public.log_client_error(text,text,text) from public;
grant execute on function public.log_client_error(text,text,text) to anon,authenticated;

-- If an owner has opted into verified MFA, privileged owner-only database
-- operations now require an aal2 session. Owners without MFA continue normally.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.staff_profiles s
    where s.user_id=auth.uid()
      and s.active=true
      and s.role='owner'
  )
  and (
    not exists(
      select 1
      from auth.mfa_factors f
      where f.user_id=auth.uid()
        and f.status='verified'
    )
    or coalesce(auth.jwt()->>'aal','aal1')='aal2'
  );
$$;

select 'PRODUCTION POLISH SUITE MIGRATION SUCCESS' as result;
