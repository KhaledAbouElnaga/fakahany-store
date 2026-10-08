-- Delete a selected backup only after the platform owner's password has
-- been re-verified by the dedicated Edge Function using Supabase Auth.
-- Deliberately inaccessible to ordinary authenticated and anonymous clients.

create or replace function public.platform_delete_backup_verified(
  backup_id_input uuid,
  actor_user_id_input uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  removed public.platform_store_backups%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'هذه العملية متاحة لخدمة التحقق الآمنة فقط';
  end if;

  if actor_user_id_input is null or not exists(
    select 1 from public.platform_admins pa
    where pa.user_id=actor_user_id_input
  ) then
    raise exception 'حساب غير مصرح له بإدارة المنصة';
  end if;

  delete from public.platform_store_backups b
  where b.id=backup_id_input
  returning * into removed;

  if not found then
    raise exception 'النسخة الاحتياطية غير موجودة أو تم حذفها بالفعل';
  end if;

  insert into public.platform_audit_log(
    actor_user_id,store_id,store_slug,action,label,details
  ) values (
    actor_user_id_input,
    removed.store_id,
    removed.store_slug,
    'backup_delete',
    left(coalesce(nullif(removed.label,''),'حذف نسخة احتياطية'),240),
    jsonb_build_object(
      'backup_id',removed.id,
      'backup_type',removed.kind,
      'backup_created_at',removed.created_at,
      'store_name',removed.store_name
    )
  );

  return jsonb_build_object(
    'ok',true,
    'backup_id',removed.id,
    'store_slug',removed.store_slug
  );
end;
$$;

revoke all on function public.platform_delete_backup_verified(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.platform_delete_backup_verified(uuid,uuid)
to service_role;
