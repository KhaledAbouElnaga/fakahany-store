-- DRAFT PATCH, not deployed simply by committing this file.
-- Future self-service registrations only; no UPDATE to existing stores.
-- New signups get Basic trial, never unlimited Pro; expiry enforcement is a separate launch gate.
-- Built from live definition on 2026-10-08, PostgreSQL 17.

CREATE OR REPLACE FUNCTION public.self_service_create_store(name_input text, slug_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  sid uuid;
  slug_value text:=lower(btrim(coalesce(slug_input,'')));
  owner_email text;
  chosen_plan text:='basic';
  trial_days integer:=14;
  chosen_features jsonb;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  perform pg_advisory_xact_lock(hashtext('fakahany.self_signup'),hashtext(auth.uid()::text));
  if exists(select 1 from public.staff_profiles where user_id=auth.uid()) then
    raise exception 'هذا الحساب مرتبط بمتجر بالفعل';
  end if;
  if exists(select 1 from public.platform_admins where user_id=auth.uid()) then
    raise exception 'حساب إدارة المنصة لا يستخدم التسجيل الذاتي';
  end if;
  if length(btrim(coalesce(name_input,'')))<2 then raise exception 'اسم المتجر مطلوب'; end if;
  if slug_value !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'رابط المتجر غير صحيح'; end if;

  select lower(coalesce(email,'')) into owner_email from auth.users where id=auth.uid();
  if owner_email='' then raise exception 'لا يوجد بريد إلكتروني للحساب'; end if;
  select features into chosen_features from public.plan_catalog where id=chosen_plan and active=true;
  if chosen_features is null then raise exception 'تعذر تحديد إعدادات المتجر'; end if;
  select greatest(1,least(30,coalesce(default_trial_days,14))) into trial_days
  from public.platform_settings where id='main';
  trial_days:=coalesce(trial_days,14);

  insert into public.stores(
    slug,name,status,plan,owner_user_id,subscription_status,trial_ends_at,paid_until,billing_note
  ) values(
    slug_value,left(btrim(name_input),120),'active',chosen_plan,auth.uid(),'trial',now()+trial_days*interval '1 day',null,
    'تجربة تسجيل ذاتي محددة المدة — بدون تجديد أو دفع تلقائي'
  ) returning id into sid;

  insert into public.shop_settings(
    id,store_id,store_name,site_name,welcome_message,setup_completed,public_site_url,feature_flags
  ) values(
    'store:'||slug_value,sid,left(btrim(name_input),120),left(btrim(name_input),120),
    'أهلاً بك',false,'',chosen_features
  );

  insert into public.categories(store_id,name_ar,display_order,visible)
  values (sid,'فواكه',1,true),(sid,'خضروات',2,true),(sid,'ورقيات',3,true);

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

  insert into public.admins(user_id,store_id)
  values(auth.uid(),sid)
  on conflict(user_id) do update set store_id=excluded.store_id;

  insert into public.staff_profiles(
    store_id,user_id,email,display_name,job_title,role,active,permissions
  ) values(
    sid,auth.uid(),owner_email,coalesce(split_part(owner_email,'@',1),'المالك'),
    'مالك','owner',true,array['*']
  );

  insert into public.platform_audit_log(actor_user_id,store_id,store_slug,action,label,details)
  values(auth.uid(),sid,slug_value,'self_service_signup',left(btrim(name_input),120),jsonb_build_object('email',owner_email));

  insert into public.platform_billing_events(store_id,plan,subscription_status,paid_until,note,created_by)
  values(sid,chosen_plan,'trial',null,'بدء تجربة التسجيل الذاتي',auth.uid());

  return jsonb_build_object('store_id',sid,'slug',slug_value,'name',left(btrim(name_input),120));
end;
$function$;

REVOKE ALL ON FUNCTION public.self_service_create_store(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_service_create_store(text,text) TO authenticated;
