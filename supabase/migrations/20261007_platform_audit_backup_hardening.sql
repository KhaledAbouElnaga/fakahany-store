-- Platform audit completeness and backup scheduling hardening.

create or replace function public.platform_start_support(store_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare mins integer:=30; expiry timestamptz; store_name text;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  select support_session_minutes into mins from public.platform_settings where id='main';
  select name into store_name from public.stores where id=store_id_input and archived_at is null;
  if store_name is null then raise exception 'المتجر غير موجود'; end if;

  expiry:=now()+(greatest(5,least(240,coalesce(mins,30)))*interval '1 minute');

  insert into public.platform_support_sessions(user_id,store_id,expires_at,created_at)
  values(auth.uid(),store_id_input,expiry,now())
  on conflict(user_id) do update set store_id=excluded.store_id,expires_at=excluded.expires_at,created_at=now();

  perform public.platform_write_audit(store_id_input,'support_start','بدء جلسة دعم',jsonb_build_object('expires_at',expiry));
  return jsonb_build_object('store_id',store_id_input,'store_name',store_name,'expires_at',expiry);
end;
$$;

create or replace function public.platform_end_support()
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare sid uuid;
begin
  select store_id into sid from public.platform_support_sessions where user_id=auth.uid();
  if sid is not null and public.is_platform_admin() then
    perform public.platform_write_audit(sid,'support_end','إنهاء جلسة دعم','{}'::jsonb);
  end if;
  delete from public.platform_support_sessions where user_id=auth.uid();
  return true;
end;
$$;

create or replace function public.platform_transfer_owner(store_id_input uuid,email_input text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare code_value text;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if position('@' in coalesce(email_input,''))=0 then raise exception 'البريد الإلكتروني غير صحيح'; end if;
  if not exists(select 1 from public.stores where id=store_id_input and archived_at is null) then raise exception 'المتجر غير موجود'; end if;

  delete from public.staff_invites
  where store_id=store_id_input and role='owner' and used_at is null;

  code_value:=upper(encode(gen_random_bytes(12),'hex'));

  insert into public.staff_invites(store_id,email,role,permissions,code_hash,created_by,job_title)
  values(
    store_id_input,lower(btrim(email_input)),'owner',array['*'],
    encode(digest(code_value,'sha256'),'hex'),auth.uid(),'مالك'
  );

  perform public.platform_write_audit(
    store_id_input,'owner_transfer_invite','إنشاء دعوة نقل ملكية',
    jsonb_build_object('email',lower(btrim(email_input)))
  );

  return jsonb_build_object(
    'code',code_value,
    'email',lower(btrim(email_input)),
    'expires_at',now()+interval '7 days'
  );
end;
$$;

create or replace function public.platform_set_settings(
  base_domain_input text,
  default_trial_days_input integer,
  support_session_minutes_input integer
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare d text:=lower(btrim(coalesce(base_domain_input,'')));
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  d:=regexp_replace(d,'^https?://','','i');
  d:=regexp_replace(d,'/.*$','','');
  d:=regexp_replace(d,'^www\.','','i');

  update public.platform_settings
  set base_domain=d,
      default_trial_days=greatest(0,least(365,coalesce(default_trial_days_input,14))),
      support_session_minutes=greatest(5,least(240,coalesce(support_session_minutes_input,30))),
      updated_at=now(),
      updated_by=auth.uid()
  where id='main';

  perform public.platform_write_audit(null,'platform_settings','تعديل إعدادات المنصة',jsonb_build_object(
    'base_domain',d,
    'support_session_minutes',greatest(5,least(240,coalesce(support_session_minutes_input,30)))
  ));

  return true;
end;
$$;

create or replace function public.run_daily_store_backups()
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  st record;
  latest timestamptz;
  created_count integer:=0;
begin
  for st in select id,name from public.stores where archived_at is null loop
    select max(created_at) into latest
    from public.platform_store_backups
    where store_id=st.id;

    if latest is null or latest<now()-interval '20 hours' then
      perform public.system_create_store_backup(st.id,'نسخة يومية تلقائية','scheduled',null);
      created_count:=created_count+1;
    end if;
  end loop;
  return created_count;
end;
$$;

select 'PLATFORM AUDIT HARDENED' as result;
