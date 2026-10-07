-- SaaS operations hardening: self-service signup, backups/restore,
-- platform audit, notifications, support tickets, and abuse controls.
-- Intentionally does NOT add automatic subscription/renewal enforcement.

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  store_id uuid,
  store_slug text not null default '',
  action text not null,
  label text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_platform_audit_created on public.platform_audit_log(created_at desc);
create index if not exists idx_platform_audit_store on public.platform_audit_log(store_id,created_at desc);

create table if not exists public.platform_store_backups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  store_slug text not null,
  store_name text not null,
  kind text not null default 'manual' check (kind in ('manual','pre_restore','pre_delete')),
  label text not null default '',
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_store_backups_store_created on public.platform_store_backups(store_id,created_at desc);
create index if not exists idx_store_backups_slug_created on public.platform_store_backups(store_slug,created_at desc);

create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  store_id uuid references public.stores(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  kind text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now()
);
create index if not exists idx_platform_notifications_severity on public.platform_notifications(severity,refreshed_at desc);
create index if not exists idx_platform_notifications_store on public.platform_notifications(store_id,refreshed_at desc);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  subject text not null,
  message text not null,
  priority text not null default 'normal' check (priority in ('normal','high')),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  admin_reply text not null default '',
  replied_by uuid references auth.users(id) on delete set null,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_tickets_store_created on public.support_tickets(store_id,created_at desc);
create index if not exists idx_support_tickets_status_created on public.support_tickets(status,created_at desc);
create index if not exists idx_support_tickets_created_by on public.support_tickets(created_by,created_at desc);

alter table public.platform_audit_log enable row level security;
alter table public.platform_store_backups enable row level security;
alter table public.platform_notifications enable row level security;
alter table public.support_tickets enable row level security;

drop policy if exists "platform admins read platform audit" on public.platform_audit_log;
create policy "platform admins read platform audit" on public.platform_audit_log
for select to authenticated using(public.is_platform_admin());

drop policy if exists "platform admins read backups" on public.platform_store_backups;
create policy "platform admins read backups" on public.platform_store_backups
for select to authenticated using(public.is_platform_admin());

drop policy if exists "platform admins read notifications" on public.platform_notifications;
create policy "platform admins read notifications" on public.platform_notifications
for select to authenticated using(public.is_platform_admin());

drop policy if exists "store staff read support tickets" on public.support_tickets;
create policy "store staff read support tickets" on public.support_tickets
for select to authenticated using(public.is_staff_for_store(store_id) or public.is_platform_admin());

drop policy if exists "store staff create support tickets" on public.support_tickets;
create policy "store staff create support tickets" on public.support_tickets
for insert to authenticated with check(
  store_id=public.current_store_id()
  and created_by=(select auth.uid())
  and public.is_staff_for_store(store_id)
);

drop policy if exists "platform admins update support tickets" on public.support_tickets;
create policy "platform admins update support tickets" on public.support_tickets
for update to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());

create or replace function public.platform_write_audit(
  store_id_input uuid,
  action_input text,
  label_input text,
  details_input jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare slug_value text:='';
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if store_id_input is not null then
    select slug into slug_value from public.stores where id=store_id_input;
  end if;
  insert into public.platform_audit_log(actor_user_id,store_id,store_slug,action,label,details)
  values(auth.uid(),store_id_input,coalesce(slug_value,''),left(coalesce(action_input,''),80),left(coalesce(label_input,''),240),coalesce(details_input,'{}'::jsonb));
end;
$$;

create or replace function public.audit_platform_store_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare old_data jsonb; new_data jsonb; sid uuid; slug_value text; label_value text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  old_data:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_data:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
  sid:=case when tg_op='DELETE' then old.id else new.id end;
  slug_value:=case when tg_op='DELETE' then old.slug else new.slug end;
  label_value:=case when tg_op='DELETE' then old.name else new.name end;

  insert into public.platform_audit_log(actor_user_id,store_id,store_slug,action,label,details)
  values(
    auth.uid(),sid,coalesce(slug_value,''),'store_'||lower(tg_op),coalesce(label_value,''),
    jsonb_build_object('old',old_data,'new',new_data)
  );

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_platform_audit_stores on public.stores;
create trigger trg_platform_audit_stores
after insert or update or delete on public.stores
for each row execute function public.audit_platform_store_change();

create or replace function public.self_service_create_store(
  name_input text,
  slug_input text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  sid uuid;
  slug_value text:=lower(btrim(coalesce(slug_input,'')));
  owner_email text;
  chosen_plan text:='pro';
  chosen_features jsonb;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
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

  insert into public.stores(
    slug,name,status,plan,owner_user_id,subscription_status,trial_ends_at,paid_until,billing_note
  ) values(
    slug_value,left(btrim(name_input),120),'active',chosen_plan,auth.uid(),'active',null,null,
    'تم الإنشاء بالتسجيل الذاتي — نموذج البيع لم يتم تحديده بعد'
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

  return jsonb_build_object('store_id',sid,'slug',slug_value,'name',left(btrim(name_input),120));
end;
$$;

create or replace function public.platform_create_backup(
  store_id_input uuid,
  label_input text default '',
  kind_input text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  st public.stores%rowtype;
  snapshot_value jsonb;
  backup_id uuid;
  kind_value text:=coalesce(nullif(kind_input,''),'manual');
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if kind_value not in ('manual','pre_restore','pre_delete') then raise exception 'نوع النسخة غير صحيح'; end if;

  select * into st from public.stores where id=store_id_input;
  if st.id is null then raise exception 'المتجر غير موجود'; end if;

  select jsonb_build_object(
    'schema_version',1,
    'captured_at',now(),
    'store',jsonb_build_object('id',st.id,'slug',st.slug,'name',st.name,'plan',st.plan,'status',st.status),
    'settings',coalesce((select to_jsonb(x) from public.shop_settings x where x.store_id=st.id limit 1),'{}'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.categories x where x.store_id=st.id),'[]'::jsonb),
    'units',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.selling_units x where x.store_id=st.id),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.products x where x.store_id=st.id),'[]'::jsonb),
    'product_options',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.product_options x where x.store_id=st.id),'[]'::jsonb),
    'delivery_areas',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.delivery_areas x where x.store_id=st.id),'[]'::jsonb),
    'order_statuses',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.id) from public.order_statuses x where x.store_id=st.id),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.orders x where x.store_id=st.id),'[]'::jsonb),
    'order_items',coalesce((select jsonb_agg(to_jsonb(x) order by x.order_id,x.id) from public.order_items x where x.store_id=st.id),'[]'::jsonb),
    'scheduled_prices',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at,x.id) from public.scheduled_prices x where x.store_id=st.id),'[]'::jsonb),
    'inventory_adjustments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.inventory_adjustments x where x.store_id=st.id),'[]'::jsonb),
    'order_events',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.order_events x where x.store_id=st.id),'[]'::jsonb)
  ) into snapshot_value;

  insert into public.platform_store_backups(store_id,store_slug,store_name,kind,label,snapshot,created_by)
  values(st.id,st.slug,st.name,kind_value,left(coalesce(label_input,''),180),snapshot_value,auth.uid())
  returning id into backup_id;

  delete from public.platform_store_backups
  where id in (
    select id from public.platform_store_backups
    where store_slug=st.slug
    order by created_at desc
    offset 12
  );

  perform public.platform_write_audit(st.id,'backup_create',coalesce(nullif(label_input,''),'نسخة احتياطية'),jsonb_build_object('backup_id',backup_id,'kind',kind_value));

  return jsonb_build_object('id',backup_id,'store_id',st.id,'store_slug',st.slug,'created_at',now(),'kind',kind_value);
end;
$$;

create or replace function public.platform_list_backups(store_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare slug_value text;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  select slug into slug_value from public.stores where id=store_id_input;
  if slug_value is null then raise exception 'المتجر غير موجود'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',b.id,'store_id',b.store_id,'store_slug',b.store_slug,'store_name',b.store_name,
      'kind',b.kind,'label',b.label,'created_at',b.created_at,
      'size_bytes',octet_length(b.snapshot::text)
    ) order by b.created_at desc)
    from public.platform_store_backups b
    where b.store_id=store_id_input or (b.store_id is null and b.store_slug=slug_value)
  ),'[]'::jsonb);
end;
$$;

create or replace function public.platform_restore_backup(backup_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  b public.platform_store_backups%rowtype;
  sid uuid;
  snap jsonb;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  select * into b from public.platform_store_backups where id=backup_id_input for update;
  if b.id is null then raise exception 'النسخة الاحتياطية غير موجودة'; end if;
  sid:=b.store_id;
  if sid is null then
    select id into sid from public.stores where slug=b.store_slug;
  end if;
  if sid is null then raise exception 'المتجر الأصلي غير موجود ولا يمكن الاسترجاع فوق متجر محذوف'; end if;

  perform public.platform_create_backup(sid,'نسخة تلقائية قبل الاسترجاع','pre_restore');
  snap:=b.snapshot;
  perform set_config('app.restore_mode','1',true);

  delete from public.order_events where store_id=sid;
  delete from public.inventory_adjustments where store_id=sid;
  delete from public.scheduled_prices where store_id=sid;
  delete from public.order_items where store_id=sid;
  delete from public.orders where store_id=sid;
  delete from public.product_options where store_id=sid;
  delete from public.products where store_id=sid;
  delete from public.delivery_areas where store_id=sid;
  delete from public.order_statuses where store_id=sid;
  delete from public.categories where store_id=sid;
  delete from public.selling_units where store_id=sid;
  delete from public.shop_settings where store_id=sid;

  insert into public.shop_settings
  select * from jsonb_populate_record(null::public.shop_settings,snap->'settings');

  insert into public.categories
  select * from jsonb_populate_recordset(null::public.categories,snap->'categories');

  insert into public.selling_units
  select * from jsonb_populate_recordset(null::public.selling_units,snap->'units');

  insert into public.products
  select * from jsonb_populate_recordset(null::public.products,snap->'products');

  insert into public.product_options
  select * from jsonb_populate_recordset(null::public.product_options,snap->'product_options');

  insert into public.delivery_areas
  select * from jsonb_populate_recordset(null::public.delivery_areas,snap->'delivery_areas');

  insert into public.order_statuses
  select * from jsonb_populate_recordset(null::public.order_statuses,snap->'order_statuses');

  insert into public.orders
  select * from jsonb_populate_recordset(null::public.orders,snap->'orders');

  insert into public.order_items
  select * from jsonb_populate_recordset(null::public.order_items,snap->'order_items');

  insert into public.scheduled_prices
  select * from jsonb_populate_recordset(null::public.scheduled_prices,snap->'scheduled_prices');

  insert into public.inventory_adjustments
  select * from jsonb_populate_recordset(null::public.inventory_adjustments,snap->'inventory_adjustments');

  insert into public.order_events
  select * from jsonb_populate_recordset(null::public.order_events,snap->'order_events');

  update public.stores
  set name=coalesce(nullif(snap->'store'->>'name',''),name),updated_at=now(),last_platform_action_at=now()
  where id=sid;

  perform public.platform_write_audit(sid,'backup_restore','استرجاع نسخة احتياطية',jsonb_build_object('backup_id',b.id,'backup_created_at',b.created_at));
  return true;
end;
$$;

create or replace function public.platform_refresh_notifications()
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare inserted_count integer:=0;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  delete from public.platform_notifications;

  insert into public.platform_notifications(notification_key,store_id,severity,kind,title,message)
  select
    'products:'||s.id::text,s.id,
    case when count(p.id)>=coalesce(pl.max_products,2147483647) then 'critical' else 'warning' end,
    'usage_products',
    'استخدام المنتجات مرتفع',
    s.name||' يستخدم '||count(p.id)::text||' من '||pl.max_products::text||' منتج في الباقة.'
  from public.stores s
  join public.plan_catalog pl on pl.id=s.plan and pl.max_products is not null
  left join public.products p on p.store_id=s.id
  where s.archived_at is null
  group by s.id,s.name,pl.max_products
  having count(p.id)>=ceil(pl.max_products*0.8);

  insert into public.platform_notifications(notification_key,store_id,severity,kind,title,message)
  select
    'staff:'||s.id::text,s.id,
    case when count(sp.user_id)>=coalesce(pl.max_staff,2147483647) then 'critical' else 'warning' end,
    'usage_staff',
    'استخدام الحسابات مرتفع',
    s.name||' يستخدم '||count(sp.user_id)::text||' من '||pl.max_staff::text||' حساب في الباقة.'
  from public.stores s
  join public.plan_catalog pl on pl.id=s.plan and pl.max_staff is not null
  left join public.staff_profiles sp on sp.store_id=s.id and sp.active=true
  where s.archived_at is null
  group by s.id,s.name,pl.max_staff
  having count(sp.user_id)>=ceil(pl.max_staff*0.8);

  insert into public.platform_notifications(notification_key,store_id,severity,kind,title,message)
  select
    'setup:'||s.id::text,s.id,'warning','setup_incomplete',
    'متجر لم يكمل الإعداد',
    s.name||' لم يكمل إعداد المتجر بعد أكثر من يومين.'
  from public.stores s
  left join public.shop_settings ss on ss.store_id=s.id
  where s.archived_at is null and s.created_at<now()-interval '2 days' and coalesce(ss.setup_completed,false)=false;

  insert into public.platform_notifications(notification_key,store_id,severity,kind,title,message)
  select
    'errors:'||s.id::text,s.id,
    case when count(e.id)>=20 then 'critical' else 'warning' end,
    'frontend_errors',
    'أخطاء متكررة في المتجر',
    s.name||' سجل '||count(e.id)::text||' خطأ Frontend خلال آخر 24 ساعة.'
  from public.stores s
  join public.client_error_log e on e.store_id=s.id and e.created_at>=now()-interval '24 hours'
  where s.archived_at is null
  group by s.id,s.name
  having count(e.id)>=5;

  insert into public.platform_notifications(notification_key,store_id,severity,kind,title,message)
  select
    'inactive:'||s.id::text,s.id,'info','inactive_store',
    'متجر غير نشط',
    s.name||' لم يسجل طلبات أو دخول مالك منذ أكثر من 30 يومًا.'
  from public.stores s
  left join lateral (
    select max(created_at) last_order from public.orders o where o.store_id=s.id
  ) o on true
  left join lateral (
    select max(last_login_at) last_login from public.staff_profiles sp where sp.store_id=s.id and sp.role='owner'
  ) l on true
  where s.archived_at is null
    and s.created_at<now()-interval '30 days'
    and greatest(coalesce(o.last_order,'epoch'::timestamptz),coalesce(l.last_login,'epoch'::timestamptz),s.created_at)<now()-interval '30 days';

  insert into public.platform_notifications(notification_key,store_id,severity,kind,title,message)
  select
    'backup:'||s.id::text,s.id,'warning','backup_stale',
    'لا توجد نسخة احتياطية حديثة',
    s.name||' لا توجد له نسخة احتياطية خلال آخر 7 أيام.'
  from public.stores s
  left join lateral (
    select max(created_at) last_backup from public.platform_store_backups b where b.store_id=s.id
  ) b on true
  where s.archived_at is null
    and (b.last_backup is null or b.last_backup<now()-interval '7 days');

  select count(*)::integer into inserted_count from public.platform_notifications;
  return inserted_count;
end;
$$;

create or replace function public.platform_list_notifications()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  perform public.platform_refresh_notifications();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',n.id,'notification_key',n.notification_key,'store_id',n.store_id,
      'store_name',coalesce(s.name,''),'store_slug',coalesce(s.slug,''),
      'severity',n.severity,'kind',n.kind,'title',n.title,'message',n.message,
      'created_at',n.created_at,'refreshed_at',n.refreshed_at
    ) order by
      case n.severity when 'critical' then 1 when 'warning' then 2 else 3 end,
      n.refreshed_at desc
    )
    from public.platform_notifications n
    left join public.stores s on s.id=n.store_id
  ),'[]'::jsonb);
end;
$$;

create or replace function public.platform_list_audit(limit_input integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select a.id,a.actor_user_id,a.store_id,a.store_slug,a.action,a.label,a.details,a.created_at
      from public.platform_audit_log a
      order by a.created_at desc
      limit greatest(1,least(coalesce(limit_input,100),500))
    ) x
  ),'[]'::jsonb);
end;
$$;

create or replace function public.create_support_ticket(
  subject_input text,
  message_input text,
  priority_input text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare sid uuid:=public.current_store_id(); new_id uuid; recent_count integer;
begin
  if sid is null or not public.is_staff_for_store(sid) then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(subject_input,'')))<3 then raise exception 'اكتب عنوان المشكلة'; end if;
  if length(btrim(coalesce(message_input,'')))<10 then raise exception 'اشرح المشكلة بشكل أوضح'; end if;
  if priority_input not in ('normal','high') then raise exception 'الأولوية غير صحيحة'; end if;

  select count(*)::integer into recent_count
  from public.support_tickets
  where store_id=sid and created_by=auth.uid() and created_at>now()-interval '1 hour';

  if recent_count>=3 then raise exception 'تم إرسال عدة طلبات دعم خلال وقت قصير. حاول لاحقًا.'; end if;

  insert into public.support_tickets(store_id,created_by,subject,message,priority)
  values(sid,auth.uid(),left(btrim(subject_input),160),left(btrim(message_input),3000),priority_input)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.list_store_support_tickets()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_staff_for_store(sid) then raise exception 'غير مصرح'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',t.id,'subject',t.subject,'message',t.message,'priority',t.priority,'status',t.status,
      'admin_reply',t.admin_reply,'replied_at',t.replied_at,'created_at',t.created_at,'updated_at',t.updated_at
    ) order by t.created_at desc)
    from public.support_tickets t
    where t.store_id=sid
  ),'[]'::jsonb);
end;
$$;

create or replace function public.platform_list_support_tickets()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',t.id,'store_id',t.store_id,'store_name',s.name,'store_slug',s.slug,
      'created_by',t.created_by,'subject',t.subject,'message',t.message,
      'priority',t.priority,'status',t.status,'admin_reply',t.admin_reply,
      'replied_at',t.replied_at,'created_at',t.created_at,'updated_at',t.updated_at
    ) order by
      case t.status when 'open' then 1 when 'in_progress' then 2 else 3 end,
      case t.priority when 'high' then 1 else 2 end,
      t.created_at desc
    )
    from public.support_tickets t
    join public.stores s on s.id=t.store_id
  ),'[]'::jsonb);
end;
$$;

create or replace function public.platform_reply_support_ticket(
  ticket_id_input uuid,
  status_input text,
  reply_input text default ''
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare sid uuid; ticket_subject text;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if status_input not in ('open','in_progress','resolved') then raise exception 'الحالة غير صحيحة'; end if;

  update public.support_tickets
  set status=status_input,
      admin_reply=left(coalesce(reply_input,''),3000),
      replied_by=case when btrim(coalesce(reply_input,''))<>'' then auth.uid() else replied_by end,
      replied_at=case when btrim(coalesce(reply_input,''))<>'' then now() else replied_at end,
      updated_at=now()
  where id=ticket_id_input
  returning store_id,subject into sid,ticket_subject;

  if sid is null then raise exception 'طلب الدعم غير موجود'; end if;
  perform public.platform_write_audit(sid,'support_ticket_update',ticket_subject,jsonb_build_object('ticket_id',ticket_id_input,'status',status_input));
  return true;
end;
$$;

create or replace function public.log_client_error(
  store_id_input uuid,
  message_input text,
  path_input text,
  source_input text default 'frontend'
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare recent_count integer;
begin
  if length(btrim(coalesce(message_input,'')))=0 then return false; end if;
  if not exists(select 1 from public.stores where id=store_id_input) then return false; end if;

  select count(*)::integer into recent_count
  from public.client_error_log
  where store_id=store_id_input and created_at>now()-interval '1 hour';

  if recent_count>=100 then return false; end if;

  insert into public.client_error_log(store_id,message,path,source)
  values(store_id_input,left(btrim(message_input),500),left(coalesce(path_input,''),240),left(coalesce(source_input,'frontend'),60));

  delete from public.client_error_log
  where store_id=store_id_input and created_at < now()-interval '30 days';

  delete from public.client_error_log
  where store_id=store_id_input and id in (
    select id from public.client_error_log
    where store_id=store_id_input
    order by created_at desc
    offset 1000
  );
  return true;
end;
$$;

-- Allow exact snapshot restore without business guardrails altering the backup.
create or replace function public.enforce_product_plan_limit()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare max_value integer; current_count integer;
begin
  if current_setting('app.restore_mode',true)='1' then return new; end if;
  select p.max_products into max_value
  from public.stores s left join public.plan_catalog p on p.id=s.plan
  where s.id=new.store_id;
  if max_value is null then return new; end if;
  select count(*)::integer into current_count from public.products where store_id=new.store_id and id<>new.id;
  if current_count>=max_value then raise exception 'وصل المتجر للحد الأقصى للمنتجات في الباقة الحالية (% منتج).',max_value; end if;
  return new;
end;
$$;

create or replace function public.enforce_staff_plan_limit()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare max_value integer; current_count integer;
begin
  if current_setting('app.restore_mode',true)='1' then return new; end if;
  if not coalesce(new.active,true) then return new; end if;
  select p.max_staff into max_value
  from public.stores s left join public.plan_catalog p on p.id=s.plan
  where s.id=new.store_id;
  if max_value is null then return new; end if;
  select count(*)::integer into current_count from public.staff_profiles where store_id=new.store_id and active=true and user_id<>new.user_id;
  if current_count>=max_value then raise exception 'وصل المتجر للحد الأقصى للحسابات في الباقة الحالية (% حسابات).',max_value; end if;
  return new;
end;
$$;

create or replace function public.enforce_settings_plan_features()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare allowed jsonb;
begin
  if current_setting('app.restore_mode',true)='1' then return new; end if;
  select p.features into allowed
  from public.stores s join public.plan_catalog p on p.id=s.plan
  where s.id=new.store_id;
  if allowed is null then return new; end if;

  new.feature_flags:=jsonb_build_object(
    'tracking',coalesce((new.feature_flags->>'tracking')::boolean,false) and coalesce((allowed->>'tracking')::boolean,false),
    'reports',coalesce((new.feature_flags->>'reports')::boolean,false) and coalesce((allowed->>'reports')::boolean,false),
    'staff',coalesce((new.feature_flags->>'staff')::boolean,false) and coalesce((allowed->>'staff')::boolean,false),
    'scheduled_prices',coalesce((new.feature_flags->>'scheduled_prices')::boolean,false) and coalesce((allowed->>'scheduled_prices')::boolean,false),
    'scheduled_orders',coalesce((new.feature_flags->>'scheduled_orders')::boolean,false) and coalesce((allowed->>'scheduled_orders')::boolean,false),
    'inventory',coalesce((new.feature_flags->>'inventory')::boolean,false) and coalesce((allowed->>'inventory')::boolean,false),
    'favorites',coalesce((new.feature_flags->>'favorites')::boolean,false) and coalesce((allowed->>'favorites')::boolean,false),
    'reorder',coalesce((new.feature_flags->>'reorder')::boolean,false) and coalesce((allowed->>'reorder')::boolean,false)
  );
  if not coalesce((allowed->>'scheduled_orders')::boolean,false) then
    new.scheduled_orders_enabled:=false;
    new.delivery_capacity_enabled:=false;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_order_guardrails()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  s public.shop_settings%rowtype;
  phone_digits text;
  recent_count integer;
  daily_count integer;
  device_prefix text;
  device_recent_count integer;
begin
  if current_setting('app.restore_mode',true)='1' then return new; end if;

  select * into s from public.shop_settings where store_id=new.store_id limit 1;
  if s.store_id is null then raise exception 'إعدادات المتجر غير موجودة'; end if;
  if coalesce(s.maintenance_mode,false) then raise exception 'المتجر تحت الصيانة حاليًا ولا يستقبل طلبات جديدة'; end if;

  device_prefix:=split_part(coalesce(new.client_token,''),'.',1);
  if length(device_prefix)>=12 then
    select count(*)::integer into device_recent_count
    from public.orders
    where store_id=new.store_id
      and split_part(coalesce(client_token,''),'.',1)=device_prefix
      and created_at>now()-interval '10 minutes';
    if device_recent_count>=5 then raise exception 'تم إرسال عدة طلبات من هذا الجهاز خلال وقت قصير. حاول مرة أخرى بعد قليل'; end if;
  end if;

  phone_digits:=regexp_replace(coalesce(new.customer_phone,''),'[^0-9]','','g');
  if phone_digits<>'' then
    select count(*)::integer into recent_count
    from public.orders
    where store_id=new.store_id
      and regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')=phone_digits
      and created_at>now()-interval '10 minutes';
    if recent_count>=4 then raise exception 'تم إرسال عدة طلبات خلال وقت قصير. حاول مرة أخرى بعد قليل'; end if;

    select count(*)::integer into daily_count
    from public.orders
    where store_id=new.store_id
      and regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')=phone_digits
      and created_at>now()-interval '24 hours';
    if daily_count>=12 then raise exception 'تم الوصول للحد المؤقت لعدد الطلبات. تواصل مع المتجر إذا كنت تحتاج مساعدة'; end if;
  end if;

  return new;
end;
$$;

create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  row_data jsonb;
  entity_id_value text:='';
  label_value text:='';
  retention_days integer:=180;
  sid uuid;
begin
  if current_setting('app.restore_mode',true)='1' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if auth.uid() is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  sid:=nullif(row_data->>'store_id','')::uuid;

  if sid is null or not exists(
    select 1 from public.staff_profiles s
    where s.user_id=auth.uid() and s.store_id=sid and s.active=true
  ) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name='staff_profiles' and tg_op='UPDATE'
     and (to_jsonb(new)-'last_login_at'-'updated_at')=(to_jsonb(old)-'last_login_at'-'updated_at') then
    return new;
  end if;

  entity_id_value:=coalesce(row_data->>'id',row_data->>'user_id','');
  label_value:=left(coalesce(row_data->>'name_ar',row_data->>'display_name',row_data->>'email',row_data->>'name',row_data->>'store_name',entity_id_value),180);

  insert into public.admin_audit_log(store_id,actor_user_id,action,entity_type,entity_id,label)
  values(sid,auth.uid(),lower(tg_op),tg_table_name,entity_id_value,label_value);

  select coalesce(audit_retention_days,180) into retention_days from public.shop_settings where store_id=sid limit 1;
  delete from public.admin_audit_log
  where store_id=sid and created_at < now()-(greatest(30,least(3650,retention_days))*interval '1 day');

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.self_service_create_store(text,text) from public;
revoke all on function public.platform_create_backup(uuid,text,text) from public;
revoke all on function public.platform_list_backups(uuid) from public;
revoke all on function public.platform_restore_backup(uuid) from public;
revoke all on function public.platform_refresh_notifications() from public;
revoke all on function public.platform_list_notifications() from public;
revoke all on function public.platform_list_audit(integer) from public;
revoke all on function public.create_support_ticket(text,text,text) from public;
revoke all on function public.list_store_support_tickets() from public;
revoke all on function public.platform_list_support_tickets() from public;
revoke all on function public.platform_reply_support_ticket(uuid,text,text) from public;
revoke all on function public.platform_write_audit(uuid,text,text,jsonb) from public;

grant execute on function public.self_service_create_store(text,text) to authenticated;
grant execute on function public.platform_create_backup(uuid,text,text) to authenticated;
grant execute on function public.platform_list_backups(uuid) to authenticated;
grant execute on function public.platform_restore_backup(uuid) to authenticated;
grant execute on function public.platform_refresh_notifications() to authenticated;
grant execute on function public.platform_list_notifications() to authenticated;
grant execute on function public.platform_list_audit(integer) to authenticated;
grant execute on function public.create_support_ticket(text,text,text) to authenticated;
grant execute on function public.list_store_support_tickets() to authenticated;
grant execute on function public.platform_list_support_tickets() to authenticated;
grant execute on function public.platform_reply_support_ticket(uuid,text,text) to authenticated;

select 'SAAS OPERATIONS HARDENING READY' as result;
