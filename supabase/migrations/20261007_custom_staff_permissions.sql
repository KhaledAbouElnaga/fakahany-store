-- Owner-defined staff titles and granular permissions.
alter table public.staff_profiles
  add column if not exists job_title text not null default '';

alter table public.staff_invites
  add column if not exists job_title text not null default '';

update public.staff_profiles
set job_title=case when role='owner' then 'مالك' else coalesce(nullif(job_title,''),display_name,'موظف') end
where job_title='';

create or replace function public.create_custom_staff_invite(
  email_input text,
  job_title_input text,
  permissions_input text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  code_value text;
  allowed text[]:=array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage'];
begin
  if not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if position('@' in coalesce(email_input,''))=0 then raise exception 'البريد الإلكتروني غير صحيح'; end if;
  if length(btrim(coalesce(job_title_input,'')))<2 then raise exception 'اكتب المسمى الوظيفي'; end if;
  if coalesce(cardinality(permissions_input),0)=0 then raise exception 'اختر صلاحية واحدة على الأقل'; end if;
  if exists(select 1 from unnest(permissions_input) p where not (p=any(allowed))) then raise exception 'توجد صلاحية غير مسموحة'; end if;

  delete from public.staff_invites where used_at is not null or expires_at<now();
  code_value:=upper(encode(gen_random_bytes(12),'hex'));

  insert into public.staff_invites(email,role,permissions,code_hash,created_by,job_title)
  values(lower(btrim(email_input)),'viewer',permissions_input,encode(digest(code_value,'sha256'),'hex'),auth.uid(),left(btrim(job_title_input),100));

  return jsonb_build_object('code',code_value,'expires_at',now()+interval '7 days');
end;
$$;
revoke all on function public.create_custom_staff_invite(text,text,text[]) from public;
grant execute on function public.create_custom_staff_invite(text,text,text[]) to authenticated;

create or replace function public.claim_staff_invite(code_input text, display_name_input text default '')
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  inv public.staff_invites%rowtype;
  current_email text;
  perms text[];
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  select lower(coalesce(email,'')) into current_email from auth.users where id=auth.uid();

  select * into inv from public.staff_invites
  where code_hash=encode(digest(upper(btrim(code_input)),'sha256'),'hex')
    and used_at is null and expires_at>now()
  for update;

  if inv.id is null then raise exception 'كود الدعوة غير صحيح أو انتهت صلاحيته'; end if;
  if lower(inv.email)<>current_email then raise exception 'الدعوة مخصصة لبريد إلكتروني مختلف'; end if;

  perms:=inv.permissions;
  if coalesce(cardinality(perms),0)=0 then
    perms:=case inv.role
      when 'manager' then array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage']
      when 'orders' then array['orders.view','orders.manage','reports.view']
      when 'inventory' then array['products.manage','inventory.manage','prices.manage']
      else array['orders.view','reports.view']
    end;
  end if;

  insert into public.admins(user_id) values(auth.uid()) on conflict do nothing;
  insert into public.staff_profiles(user_id,email,display_name,job_title,role,active,permissions)
  values(auth.uid(),current_email,left(coalesce(display_name_input,''),100),left(coalesce(nullif(inv.job_title,''),'موظف'),100),'viewer',true,perms)
  on conflict(user_id) do update set
    email=excluded.email,display_name=excluded.display_name,job_title=excluded.job_title,
    role='viewer',active=true,permissions=excluded.permissions,updated_at=now();

  update public.staff_invites set used_at=now() where id=inv.id;
  return true;
end;
$$;

create or replace function public.update_custom_staff_member(
  user_id_input uuid,
  job_title_input text,
  permissions_input text[],
  active_input boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  allowed text[]:=array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage'];
  target_role text;
begin
  if not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  select role into target_role from public.staff_profiles where user_id=user_id_input;
  if target_role is null then raise exception 'الموظف غير موجود'; end if;
  if target_role='owner' then raise exception 'لا يمكن تعديل صلاحيات حساب المالك من هنا'; end if;
  if length(btrim(coalesce(job_title_input,'')))<2 then raise exception 'اكتب المسمى الوظيفي'; end if;
  if coalesce(cardinality(permissions_input),0)=0 then raise exception 'اختر صلاحية واحدة على الأقل'; end if;
  if exists(select 1 from unnest(permissions_input) p where not (p=any(allowed))) then raise exception 'توجد صلاحية غير مسموحة'; end if;

  update public.staff_profiles set
    job_title=left(btrim(job_title_input),100),
    role='viewer',
    permissions=permissions_input,
    active=active_input,
    updated_at=now()
  where user_id=user_id_input;
  return true;
end;
$$;
revoke all on function public.update_custom_staff_member(uuid,text,text[],boolean) from public;
grant execute on function public.update_custom_staff_member(uuid,text,text[],boolean) to authenticated;

select 'CUSTOM STAFF PERMISSIONS MIGRATION SUCCESS' as result;
