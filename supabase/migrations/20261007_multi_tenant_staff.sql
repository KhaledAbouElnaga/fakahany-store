-- Tenant-aware staff authentication and invitations.

create or replace function public.admin_exists()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1 from public.staff_profiles
    where store_id=public.default_store_id() and role='owner' and active=true
  );
$$;

create or replace function public.claim_first_admin()
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare user_email text; sid uuid:=public.default_store_id();
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  perform pg_advisory_xact_lock(hashtext('fakahany.claim_first_admin.'||sid::text));

  if exists(select 1 from public.staff_profiles where store_id=sid and role='owner' and active=true) then
    if exists(select 1 from public.staff_profiles where user_id=auth.uid() and store_id=sid and role='owner' and active=true) then return true; end if;
    raise exception 'تم تعيين المدير الأول بالفعل';
  end if;

  select coalesce(email,'') into user_email from auth.users where id=auth.uid();
  insert into public.admins(user_id,store_id) values(auth.uid(),sid)
  on conflict(user_id) do update set store_id=excluded.store_id;

  insert into public.staff_profiles(store_id,user_id,email,display_name,job_title,role,active,permissions)
  values(sid,auth.uid(),user_email,coalesce(split_part(user_email,'@',1),'المالك'),'مالك','owner',true,array['*'])
  on conflict(user_id) do update set store_id=sid,role='owner',active=true,permissions=array['*'],updated_at=now();

  return true;
end;
$$;

create or replace function public.claim_staff_invite(
  store_id_input uuid,
  code_input text,
  display_name_input text default ''
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  inv public.staff_invites%rowtype;
  current_email text;
  perms text[];
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  select lower(coalesce(email,'')) into current_email from auth.users where id=auth.uid();

  select * into inv from public.staff_invites
  where store_id=store_id_input
    and code_hash=encode(digest(upper(btrim(code_input)),'sha256'),'hex')
    and used_at is null and expires_at>now()
  for update;

  if inv.id is null then raise exception 'كود الدعوة غير صحيح أو انتهت صلاحيته'; end if;
  if lower(inv.email)<>current_email then raise exception 'الدعوة مخصصة لبريد إلكتروني مختلف'; end if;

  perms:=inv.permissions;
  if inv.role='owner' then
    perms:=array['*'];
  elsif coalesce(cardinality(perms),0)=0 then
    perms:=case inv.role
      when 'manager' then array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage']
      when 'orders' then array['orders.view','orders.manage','reports.view']
      when 'inventory' then array['products.manage','inventory.manage','prices.manage']
      else array['orders.view','reports.view']
    end;
  end if;

  insert into public.admins(user_id,store_id) values(auth.uid(),store_id_input)
  on conflict(user_id) do update set store_id=excluded.store_id;

  insert into public.staff_profiles(store_id,user_id,email,display_name,job_title,role,active,permissions)
  values(
    store_id_input,auth.uid(),current_email,left(coalesce(display_name_input,''),100),
    left(coalesce(nullif(inv.job_title,''),case when inv.role='owner' then 'مالك' else 'موظف' end),100),
    inv.role,true,perms
  )
  on conflict(user_id) do update set
    store_id=excluded.store_id,email=excluded.email,display_name=excluded.display_name,
    job_title=excluded.job_title,role=excluded.role,active=true,permissions=excluded.permissions,updated_at=now();

  if inv.role='owner' then
    update public.stores set owner_user_id=auth.uid(),updated_at=now() where id=store_id_input;
  end if;

  update public.staff_invites set used_at=now() where id=inv.id and store_id=store_id_input;
  return true;
end;
$$;

create or replace function public.claim_staff_invite(code_input text,display_name_input text default '')
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare sid uuid;
begin
  select store_id into sid from public.staff_invites
  where code_hash=encode(digest(upper(btrim(code_input)),'sha256'),'hex')
    and used_at is null and expires_at>now()
  limit 1;
  if sid is null then raise exception 'كود الدعوة غير صحيح أو انتهت صلاحيته'; end if;
  return public.claim_staff_invite(sid,code_input,display_name_input);
end;
$$;

create or replace function public.create_custom_staff_invite(email_input text,job_title_input text,permissions_input text[])
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  code_value text;
  sid uuid:=public.current_store_id();
  allowed text[]:=array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage'];
begin
  if sid is null or not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if position('@' in coalesce(email_input,''))=0 then raise exception 'البريد الإلكتروني غير صحيح'; end if;
  if length(btrim(coalesce(job_title_input,'')))<2 then raise exception 'اكتب المسمى الوظيفي'; end if;
  if coalesce(cardinality(permissions_input),0)=0 then raise exception 'اختر صلاحية واحدة على الأقل'; end if;
  if exists(select 1 from unnest(permissions_input) p where not (p=any(allowed))) then raise exception 'توجد صلاحية غير مسموحة'; end if;

  delete from public.staff_invites where store_id=sid and (used_at is not null or expires_at<now());
  code_value:=upper(encode(gen_random_bytes(12),'hex'));

  insert into public.staff_invites(store_id,email,role,permissions,code_hash,created_by,job_title)
  values(sid,lower(btrim(email_input)),'viewer',permissions_input,encode(digest(code_value,'sha256'),'hex'),auth.uid(),left(btrim(job_title_input),100));

  return jsonb_build_object('code',code_value,'expires_at',now()+interval '7 days');
end;
$$;

create or replace function public.create_staff_invite(email_input text,role_input text,display_permissions text[] default array[]::text[])
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare code_value text; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if role_input not in ('manager','orders','inventory','viewer') then raise exception 'الدور غير صحيح'; end if;
  if position('@' in coalesce(email_input,''))=0 then raise exception 'البريد الإلكتروني غير صحيح'; end if;

  delete from public.staff_invites where store_id=sid and (used_at is not null or expires_at<now());
  code_value:=upper(encode(gen_random_bytes(12),'hex'));

  insert into public.staff_invites(store_id,email,role,permissions,code_hash,created_by)
  values(sid,lower(btrim(email_input)),role_input,coalesce(display_permissions,array[]::text[]),encode(digest(code_value,'sha256'),'hex'),auth.uid());

  return jsonb_build_object('code',code_value,'expires_at',now()+interval '7 days');
end;
$$;

create or replace function public.record_staff_login()
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  update public.staff_profiles
  set last_login_at=now(),updated_at=now()
  where user_id=auth.uid() and active=true;
  return found;
end;
$$;
