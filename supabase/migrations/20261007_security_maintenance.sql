-- Security maintenance: restrict internal helpers and document intentional no-direct-access table.
-- Safe to run after the existing migrations.

-- Internal trigger/helper functions should never be callable from the public API.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.apply_default_order_status() from public, anon, authenticated;

-- This table is only accessed through SECURITY DEFINER RPCs.
-- Add an explicit deny policy so the intent is clear and security tooling no longer sees "RLS with no policy".
drop policy if exists "deny direct cleanup security access" on public.order_cleanup_security;
create policy "deny direct cleanup security access"
on public.order_cleanup_security
for all
to authenticated
using (false)
with check (false);

select 'SECURITY MAINTENANCE MIGRATION SUCCESS' as result;
