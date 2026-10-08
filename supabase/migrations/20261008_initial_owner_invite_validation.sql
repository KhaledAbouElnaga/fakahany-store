-- Restrict email-free invitation activation to initial owner invitations
-- issued by authenticated platform administrators. This function only checks
-- eligibility. Actual account creation and invitation redemption happen inside
-- the Edge Function under one purpose-limited flow.
create or replace function public.validate_initial_owner_invite(
  store_id_input uuid,
  email_input text,
  code_input text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,extensions
as $$
  select
    store_id_input is not null
    and lower(btrim(coalesce(email_input,''))) ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
    and upper(btrim(coalesce(code_input,''))) ~ '^[A-F0-9]{24}$'
    and exists (
      select 1
      from public.staff_invites i
      join public.stores s on s.id=i.store_id
      join public.platform_admins pa on pa.user_id=i.created_by
      where i.store_id=store_id_input
        and i.role='owner'
        and i.used_at is null
        and i.expires_at>now()
        and lower(i.email)=lower(btrim(email_input))
        and i.code_hash=encode(digest(upper(btrim(code_input)),'sha256'),'hex')
        and s.status='active'
        and s.archived_at is null
        and s.owner_user_id is null
        and not exists (
          select 1 from public.staff_profiles p
          where p.store_id=s.id and p.role='owner' and p.active
        )
    );
$$;
revoke all on function public.validate_initial_owner_invite(uuid,text,text) from public;
grant execute on function public.validate_initial_owner_invite(uuid,text,text) to anon,authenticated;
