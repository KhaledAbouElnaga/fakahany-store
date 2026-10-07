-- Tenant-aware staff management mutations.

create or replace function public.update_custom_staff_member(user_id_input uuid,job_title_input text,permissions_input text[],active_input boolean)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  allowed text[]:=array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage'];
  target_role text;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  select role into target_role from public.staff_profiles where store_id=sid and user_id=user_id_input;
  if target_role is null then raise exception 'الموظف غير موجود'; end if;
  if target_role='owner' then raise exception 'لا يمكن تعديل صلاحيات حساب المالك من هنا'; end if;
  if length(btrim(coalesce(job_title_input,'')))<2 then raise exception 'اكتب المسمى الوظيفي'; end if;
  if coalesce(cardinality(permissions_input),0)=0 then raise exception 'اختر صلاحية واحدة على الأقل'; end if;
  if exists(select 1 from unnest(permissions_input) p where not (p=any(allowed))) then raise exception 'توجد صلاحية غير مسموحة'; end if;

  update public.staff_profiles set
    job_title=left(btrim(job_title_input),100),role='viewer',permissions=permissions_input,
    active=active_input,updated_at=now()
  where store_id=sid and user_id=user_id_input;
  return true;
end;
$$;

create or replace function public.update_staff_member(user_id_input uuid,role_input text,active_input boolean)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare perms text[]; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if user_id_input=auth.uid() and active_input=false then raise exception 'لا يمكنك تعطيل حساب المالك الحالي'; end if;
  if user_id_input=auth.uid() and role_input<>'owner' then raise exception 'لا يمكنك خفض صلاحية حساب المالك الحالي'; end if;
  if role_input not in ('owner','manager','orders','inventory','viewer') then raise exception 'الدور غير صحيح'; end if;

  perms:=case role_input
    when 'owner' then array['*']
    when 'manager' then array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage']
    when 'orders' then array['orders.view','orders.manage','reports.view']
    when 'inventory' then array['products.manage','inventory.manage','prices.manage']
    else array['orders.view','reports.view']
  end;

  update public.staff_profiles
  set role=role_input,active=active_input,permissions=perms,updated_at=now()
  where store_id=sid and user_id=user_id_input;

  if not found then raise exception 'الموظف غير موجود'; end if;
  return true;
end;
$$;

create or replace function public.remove_staff_member(user_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare target_role text; target_email text; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if user_id_input=auth.uid() then raise exception 'لا يمكنك حذف حسابك الحالي'; end if;

  select role,email into target_role,target_email
  from public.staff_profiles where store_id=sid and user_id=user_id_input for update;

  if target_role is null then raise exception 'الحساب غير موجود'; end if;
  if target_role='owner' then raise exception 'لا يمكن حذف حساب مالك من هنا'; end if;

  delete from public.admins where store_id=sid and user_id=user_id_input;
  delete from public.staff_profiles where store_id=sid and user_id=user_id_input;
  delete from public.staff_invites where store_id=sid and lower(email)=lower(coalesce(target_email,'')) and used_at is null;
  return true;
end;
$$;
