-- Automatically remove store-exclusive Auth accounts after irreversible
-- store deletion. Never delete the platform owner or cross-store users.

create or replace function public.platform_store_auth_cleanup_candidates(store_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرح';
  end if;
  if not exists (
    select 1 from public.stores
    where id=store_id_input and status='suspended'
  ) then
    raise exception 'المتجر غير موجود أو لم يتم إيقافه';
  end if;

  with linked as (
    select sp.user_id as uid from public.staff_profiles sp
      where sp.store_id=store_id_input
    union
    select a.user_id as uid from public.admins a
      where a.store_id=store_id_input
    union
    select s.owner_user_id as uid from public.stores s
      where s.id=store_id_input and s.owner_user_id is not null
  ), classified as (
    select l.uid,
      case
        when l.uid=auth.uid() then 'current_platform_admin'
        when exists (
          select 1 from public.platform_admins pa where pa.user_id=l.uid
        ) then 'platform_admin'
        when exists (
          select 1 from public.staff_profiles sp
          where sp.user_id=l.uid and sp.store_id<>store_id_input
        ) or exists (
          select 1 from public.admins a
          where a.user_id=l.uid and a.store_id<>store_id_input
        ) or exists (
          select 1 from public.stores s
          where s.owner_user_id=l.uid and s.id<>store_id_input
        ) then 'used_by_another_store'
        else 'exclusive_to_store'
      end as reason
    from linked l where l.uid is not null
  )
  select jsonb_build_object(
    'delete_user_ids',coalesce(jsonb_agg(c.uid) filter (where c.reason='exclusive_to_store'),'[]'::jsonb),
    'eligible_count',count(*) filter (where c.reason='exclusive_to_store'),
    'protected_count',count(*) filter (where c.reason<>'exclusive_to_store')
  ) into result
  from classified c;

  return coalesce(result,jsonb_build_object('delete_user_ids','[]'::jsonb,'eligible_count',0,'protected_count',0));
end;
$$;

create or replace function public.platform_auth_user_safe_to_delete(user_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرح';
  end if;
  if user_id_input is null or user_id_input=auth.uid() then return false; end if;

  return
    not exists (select 1 from public.platform_admins where user_id=user_id_input)
    and not exists (select 1 from public.staff_profiles where user_id=user_id_input)
    and not exists (select 1 from public.admins where user_id=user_id_input)
    and not exists (select 1 from public.stores where owner_user_id=user_id_input);
end;
$$;

revoke all on function public.platform_store_auth_cleanup_candidates(uuid) from public;
revoke all on function public.platform_auth_user_safe_to_delete(uuid) from public;
grant execute on function public.platform_store_auth_cleanup_candidates(uuid) to authenticated;
grant execute on function public.platform_auth_user_safe_to_delete(uuid) to authenticated;
