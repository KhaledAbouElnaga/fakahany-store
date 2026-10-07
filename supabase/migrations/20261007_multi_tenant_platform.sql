-- SaaS platform operations: create, list, suspend, and map domains.

create or replace function public.platform_list_stores()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'slug',s.slug,'name',s.name,'custom_domain',s.custom_domain,
      'status',s.status,'plan',s.plan,'created_at',s.created_at,
      'owner_email',coalesce(owner_profile.email,''),
      'products_count',(select count(*) from public.products p where p.store_id=s.id),
      'orders_count',(select count(*) from public.orders o where o.store_id=s.id),
      'staff_count',(select count(*) from public.staff_profiles sp where sp.store_id=s.id)
    ) order by s.created_at)
    from public.stores s
    left join lateral (
      select email from public.staff_profiles x
      where x.store_id=s.id and x.role='owner'
      order by x.created_at limit 1
    ) owner_profile on true
  ),'[]'::jsonb);
end;
$$;

create or replace function public.platform_create_store(
  name_input text,
  slug_input text,
  owner_email_input text,
  custom_domain_input text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  sid uuid;
  slug_value text:=lower(btrim(coalesce(slug_input,'')));
  domain_value text:=lower(btrim(coalesce(custom_domain_input,'')));
  owner_email text:=lower(btrim(coalesce(owner_email_input,'')));
  code_value text;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(name_input,'')))<2 then raise exception 'اسم المتجر مطلوب'; end if;
  if slug_value !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'رابط المتجر غير صحيح'; end if;
  if position('@' in owner_email)=0 then raise exception 'بريد المالك غير صحيح'; end if;

  domain_value:=regexp_replace(domain_value,'^https?://','','i');
  domain_value:=regexp_replace(domain_value,'/.*$','','');
  domain_value:=regexp_replace(domain_value,'^www\.','','i');
  if domain_value='' then domain_value:=null; end if;

  insert into public.stores(slug,name,custom_domain,status,plan)
  values(slug_value,left(btrim(name_input),120),domain_value,'active','standard')
  returning id into sid;

  insert into public.shop_settings(
    id,store_id,store_name,site_name,welcome_message,setup_completed,public_site_url
  ) values(
    'store:'||slug_value,sid,left(btrim(name_input),120),left(btrim(name_input),120),
    'أهلاً بك',false,coalesce(domain_value,'')
  );

  insert into public.categories(store_id,name_ar,display_order,visible)
  values
    (sid,'فواكه',1,true),(sid,'خضروات',2,true),(sid,'ورقيات',3,true);

  insert into public.selling_units(store_id,name_ar,display_order,active)
  values
    (sid,'كيلو',1,true),(sid,'نصف كيلو',2,true),(sid,'ربع كيلو',3,true),
    (sid,'قطعة',4,true),(sid,'عبوة',5,true),(sid,'ربطة',6,true);

  insert into public.order_statuses(store_id,name,note,display_order,active,is_new,is_completed,is_cancelled)
  values
    (sid,'جديد','طلب جديد لم يبدأ التعامل معه بعد.',1,true,true,false,false),
    (sid,'جاري التجهيز','الطلب قيد التجهيز.',2,true,false,false,false),
    (sid,'خرج للتوصيل','تم تجهيز الطلب وخرج للتوصيل.',3,true,false,false,false),
    (sid,'مكتمل','تم إنهاء الطلب بنجاح.',4,true,false,true,false),
    (sid,'ملغي','تم إلغاء الطلب.',5,true,false,false,true);

  insert into public.order_cleanup_security(id,store_id)
  values('store:'||slug_value,sid)
  on conflict(id) do nothing;

  code_value:=upper(encode(gen_random_bytes(12),'hex'));
  insert into public.staff_invites(
    store_id,email,role,permissions,code_hash,created_by,job_title
  ) values(
    sid,owner_email,'owner',array['*'],
    encode(digest(code_value,'sha256'),'hex'),auth.uid(),'مالك'
  );

  return jsonb_build_object(
    'store_id',sid,'slug',slug_value,'invite_code',code_value,'owner_email',owner_email
  );
end;
$$;

create or replace function public.platform_set_store_status(store_id_input uuid,status_input text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if status_input not in ('active','suspended') then raise exception 'الحالة غير صحيحة'; end if;
  update public.stores set status=status_input,updated_at=now() where id=store_id_input;
  if not found then raise exception 'المتجر غير موجود'; end if;
  return true;
end;
$$;

create or replace function public.platform_set_store_domain(store_id_input uuid,domain_input text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare d text:=lower(btrim(coalesce(domain_input,'')));
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  d:=regexp_replace(d,'^https?://','','i');
  d:=regexp_replace(d,'/.*$','','');
  d:=regexp_replace(d,'^www\.','','i');
  if d='' then d:=null; end if;
  update public.stores set custom_domain=d,updated_at=now() where id=store_id_input;
  if not found then raise exception 'المتجر غير موجود'; end if;
  return true;
end;
$$;

revoke all on function public.platform_list_stores() from public;
revoke all on function public.platform_create_store(text,text,text,text) from public;
revoke all on function public.platform_set_store_status(uuid,text) from public;
revoke all on function public.platform_set_store_domain(uuid,text) from public;
grant execute on function public.platform_list_stores() to authenticated;
grant execute on function public.platform_create_store(text,text,text,text) to authenticated;
grant execute on function public.platform_set_store_status(uuid,text) to authenticated;
grant execute on function public.platform_set_store_domain(uuid,text) to authenticated;
