-- Authenticated-only support RPC access; never expose privileged operations to
-- anonymous clients. All sensitive RPCs retain their internal is_platform_admin()
-- and active support session authorization checks.
revoke all on function public.platform_start_support(uuid) from public, anon;
grant execute on function public.platform_start_support(uuid) to authenticated;

revoke all on function public.platform_end_support() from public, anon;
grant execute on function public.platform_end_support() to authenticated;

revoke all on function public.platform_support_status() from public, anon;
grant execute on function public.platform_support_status() to authenticated;

-- An unauthenticated client must never be able to start support.
do $$
begin
  if has_function_privilege('anon','public.platform_start_support(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.platform_start_support(uuid)','EXECUTE') then
    raise exception 'Support function privilege verification failed';
  end if;
end $$;
