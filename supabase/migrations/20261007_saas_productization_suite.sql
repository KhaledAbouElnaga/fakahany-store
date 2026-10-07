-- SaaS productization suite: plans, subscriptions, platform analytics, support sessions, and lifecycle controls.

create table if not exists public.platform_settings (
  id text primary key default 'main',
  base_domain text not null default '',
  default_trial_days integer not null default 14 check (default_trial_days between 0 and 365),
  support_session_minutes integer not null default 30 check (support_session_minutes between 5 and 240),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.platform_settings(id) values('main') on conflict(id) do nothing;

create table if not exists public.plan_catalog (
  id text primary key,
  name_ar text not null,
  max_products integer,
  max_staff integer,
  price_egp numeric,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_products is null or max_products > 0),
  check (max_staff is null or max_staff > 0),
  check (price_egp is null or price_egp >= 0)
);

insert into public.plan_catalog(id,name_ar,max_products,max_staff,price_egp,features,active,display_order) values
('basic','أساسي',100,3,null,'{"tracking":true,"reports":true,"staff":true,"scheduled_prices":false,"scheduled_orders":false,"inventory":false,"favorites":true,"reorder":true}'::jsonb,true,1),
('pro','احترافي',500,10,null,'{"tracking":true,"reports":true,"staff":true,"scheduled_prices":true,"scheduled_orders":true,"inventory":true,"favorites":true,"reorder":true}'::jsonb,true,2),
('business','أعمال',null,null,null,'{"tracking":true,"reports":true,"staff":true,"scheduled_prices":true,"scheduled_orders":true,"inventory":true,"favorites":true,"reorder":true}'::jsonb,true,3)
on conflict(id) do update set
  name_ar=excluded.name_ar,
  max_products=excluded.max_products,
  max_staff=excluded.max_staff,
  features=excluded.features,
  active=excluded.active,
  display_order=excluded.display_order,
  updated_at=now();

alter table public.stores
  add column if not exists subscription_status text not null default 'trial',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists paid_until timestamptz,
  add column if not exists billing_note text not null default '',
  add column if not exists archived_at timestamptz,
  add column if not exists last_platform_action_at timestamptz not null default now();

alter table public.stores drop constraint if exists stores_subscription_status_check;
alter table public.stores add constraint stores_subscription_status_check
  check (subscription_status in ('trial','active','past_due','paused'));

update public.stores
set plan=case when plan in ('basic','pro','business') then plan else 'pro' end,
    trial_ends_at=coalesce(trial_ends_at,created_at+interval '14 days');

create table if not exists public.platform_billing_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  plan text not null,
  subscription_status text not null,
  paid_until timestamptz,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_platform_billing_store_created on public.platform_billing_events(store_id,created_at desc);

create table if not exists public.platform_support_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_store on public.platform_support_sessions(store_id,expires_at);

alter table public.platform_settings enable row level security;
alter table public.plan_catalog enable row level security;
alter table public.platform_billing_events enable row level security;
alter table public.platform_support_sessions enable row level security;

drop policy if exists "platform admins read settings" on public.platform_settings;
create policy "platform admins read settings" on public.platform_settings
for select to authenticated using(public.is_platform_admin());

drop policy if exists "platform admins manage settings" on public.platform_settings;
create policy "platform admins manage settings" on public.platform_settings
for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());

drop policy if exists "staff read active plans" on public.plan_catalog;
create policy "staff read active plans" on public.plan_catalog
for select to authenticated using(active or public.is_platform_admin());

drop policy if exists "platform admins manage plans" on public.plan_catalog;
create policy "platform admins manage plans" on public.plan_catalog
for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());

drop policy if exists "platform admins read billing" on public.platform_billing_events;
create policy "platform admins read billing" on public.platform_billing_events
for select to authenticated using(public.is_platform_admin());

drop policy if exists "support user reads own session" on public.platform_support_sessions;
create policy "support user reads own session" on public.platform_support_sessions
for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.active_support_store_id()
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select s.store_id
  from public.platform_support_sessions s
  where s.user_id=auth.uid()
    and s.expires_at>now()
    and public.is_platform_admin()
  limit 1;
$$;

create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select coalesce(
    public.active_support_store_id(),
    (
      select s.store_id
      from public.staff_profiles s
      where s.user_id=auth.uid() and s.active=true
      limit 1
    )
  );
$$;

create or replace function public.is_staff_for_store(store_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select auth.uid() is not null and (
    exists(
      select 1 from public.staff_profiles s
      where s.user_id=auth.uid() and s.active=true and s.store_id=store_id_input
    )
    or public.active_support_store_id()=store_id_input
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select auth.uid() is not null and (
    exists(select 1 from public.staff_profiles s where s.user_id=auth.uid() and s.active=true)
    or public.active_support_store_id() is not null
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select (
    public.active_support_store_id() is not null
    or exists(
      select 1 from public.staff_profiles s
      where s.user_id=auth.uid() and s.active=true and s.role='owner'
    )
  )
  and (
    not exists(
      select 1 from auth.mfa_factors f
      where f.user_id=auth.uid() and f.status='verified'
    )
    or coalesce(auth.jwt()->>'aal','aal1')='aal2'
  );
$$;

create or replace function public.has_permission(permission_input text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select public.active_support_store_id() is not null
  or exists(
    select 1 from public.staff_profiles s
    where s.user_id=auth.uid()
      and s.active=true
      and (s.role='owner' or '*'=any(s.permissions) or permission_input=any(s.permissions))
  );
$$;

create or replace function public.current_staff_profile()
returns public.staff_profiles
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  r public.staff_profiles%rowtype;
  sid uuid:=public.active_support_store_id();
  user_email text;
begin
  if sid is not null then
    select * into r from public.staff_profiles where user_id=auth.uid() limit 1;
    if r.user_id is null then
      select coalesce(email,'') into user_email from auth.users where id=auth.uid();
      r.user_id:=auth.uid();
      r.email:=user_email;
      r.display_name:='دعم المنصة';
      r.job_title:='دعم المنصة';
      r.role:='owner';
      r.active:=true;
      r.permissions:=array['*'];
      r.created_at:=now();
      r.updated_at:=now();
    end if;
    r.store_id:=sid;
    r.role:='owner';
    r.active:=true;
    r.permissions:=array['*'];
    return r;
  end if;

  select * into r
  from public.staff_profiles
  where user_id=auth.uid() and active=true
  limit 1;
  return r;
end;
$$;

create or replace function public.platform_get_settings()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare s public.platform_settings%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  select * into s from public.platform_settings where id='main';
  return jsonb_build_object(
    'base_domain',s.base_domain,
    'default_trial_days',s.default_trial_days,
    'support_session_minutes',s.support_session_minutes
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

  return true;
end;
$$;

create or replace function public.current_store_plan_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  sid uuid:=public.current_store_id();
  st public.stores%rowtype;
  pl public.plan_catalog%rowtype;
  products_count integer:=0;
  staff_count integer:=0;
begin
  if sid is null then raise exception 'لا يوجد متجر حالي'; end if;
  select * into st from public.stores where id=sid;
  select * into pl from public.plan_catalog where id=st.plan;

  select count(*)::integer into products_count from public.products where store_id=sid;
  select count(*)::integer into staff_count from public.staff_profiles where store_id=sid and active=true;

  return jsonb_build_object(
    'plan',st.plan,
    'plan_name',coalesce(pl.name_ar,st.plan),
    'subscription_status',st.subscription_status,
    'trial_ends_at',st.trial_ends_at,
    'paid_until',st.paid_until,
    'products_count',products_count,
    'max_products',pl.max_products,
    'staff_count',staff_count,
    'max_staff',pl.max_staff,
    'features',coalesce(pl.features,'{}'::jsonb)
  );
end;
$$;

create or replace function public.enforce_product_plan_limit()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare max_value integer; current_count integer;
begin
  select p.max_products into max_value
  from public.stores s
  left join public.plan_catalog p on p.id=s.plan
  where s.id=new.store_id;

  if max_value is null then return new; end if;

  select count(*)::integer into current_count
  from public.products
  where store_id=new.store_id and id<>new.id;

  if current_count>=max_value then
    raise exception 'وصل المتجر للحد الأقصى للمنتجات في الباقة الحالية (% منتج).',max_value;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_plan_limit on public.products;
create trigger trg_product_plan_limit
before insert on public.products
for each row execute function public.enforce_product_plan_limit();

create or replace function public.enforce_staff_plan_limit()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare max_value integer; current_count integer;
begin
  if not coalesce(new.active,true) then return new; end if;

  select p.max_staff into max_value
  from public.stores s
  left join public.plan_catalog p on p.id=s.plan
  where s.id=new.store_id;

  if max_value is null then return new; end if;

  select count(*)::integer into current_count
  from public.staff_profiles
  where store_id=new.store_id and active=true and user_id<>new.user_id;

  if current_count>=max_value then
    raise exception 'وصل المتجر للحد الأقصى للحسابات في الباقة الحالية (% حسابات).',max_value;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_staff_plan_limit on public.staff_profiles;
create trigger trg_staff_plan_limit
before insert or update of active,store_id on public.staff_profiles
for each row execute function public.enforce_staff_plan_limit();

create or replace function public.platform_list_plans()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'name_ar',name_ar,'max_products',max_products,'max_staff',max_staff,
      'price_egp',price_egp,'features',features,'active',active,'display_order',display_order
    ) order by display_order,id)
    from public.plan_catalog
  ),'[]'::jsonb);
end;
$$;

create or replace function public.platform_set_store_plan(store_id_input uuid,plan_input text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare f jsonb;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;

  select features into f from public.plan_catalog where id=plan_input and active=true;
  if f is null then raise exception 'الباقة غير موجودة'; end if;

  update public.stores
  set plan=plan_input,updated_at=now(),last_platform_action_at=now()
  where id=store_id_input;
  if not found then raise exception 'المتجر غير موجود'; end if;

  update public.shop_settings
  set feature_flags=f,updated_at=now()
  where store_id=store_id_input;

  insert into public.platform_billing_events(store_id,plan,subscription_status,paid_until,note,created_by)
  select id,plan,subscription_status,paid_until,'تغيير الباقة',auth.uid()
  from public.stores where id=store_id_input;

  return true;
end;
$$;

create or replace function public.platform_set_subscription(
  store_id_input uuid,
  status_input text,
  paid_until_input timestamptz,
  note_input text default ''
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare st public.stores%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if status_input not in ('trial','active','past_due','paused') then raise exception 'حالة الاشتراك غير صحيحة'; end if;

  update public.stores
  set subscription_status=status_input,
      paid_until=paid_until_input,
      billing_note=left(coalesce(note_input,''),500),
      updated_at=now(),
      last_platform_action_at=now()
  where id=store_id_input
  returning * into st;

  if st.id is null then raise exception 'المتجر غير موجود'; end if;

  insert into public.platform_billing_events(store_id,plan,subscription_status,paid_until,note,created_by)
  values(st.id,st.plan,st.subscription_status,st.paid_until,left(coalesce(note_input,''),500),auth.uid());

  return true;
end;
$$;

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

  return jsonb_build_object('store_id',store_id_input,'store_name',store_name,'expires_at',expiry);
end;
$$;

create or replace function public.platform_end_support()
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  delete from public.platform_support_sessions where user_id=auth.uid();
  return true;
end;
$$;

create or replace function public.platform_support_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare ss public.platform_support_sessions%rowtype; store_name text;
begin
  select * into ss
  from public.platform_support_sessions
  where user_id=auth.uid() and expires_at>now();

  if ss.store_id is null then return jsonb_build_object('active',false); end if;
  select name into store_name from public.stores where id=ss.store_id;

  return jsonb_build_object(
    'active',true,
    'store_id',ss.store_id,
    'store_name',store_name,
    'expires_at',ss.expires_at
  );
end;
$$;

create or replace function public.platform_get_overview()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;

  select jsonb_build_object(
    'total_stores',(select count(*) from public.stores where archived_at is null),
    'active_stores',(select count(*) from public.stores where archived_at is null and status='active'),
    'suspended_stores',(select count(*) from public.stores where archived_at is null and status='suspended'),
    'stores_active_7d',(
      select count(*) from public.stores s
      where s.archived_at is null and greatest(
        coalesce((select max(o.created_at) from public.orders o where o.store_id=s.id),'epoch'::timestamptz),
        coalesce((select max(sp.last_login_at) from public.staff_profiles sp where sp.store_id=s.id),'epoch'::timestamptz)
      )>=now()-interval '7 days'
    ),
    'stores_inactive_30d',(
      select count(*) from public.stores s
      where s.archived_at is null and greatest(
        coalesce((select max(o.created_at) from public.orders o where o.store_id=s.id),'epoch'::timestamptz),
        coalesce((select max(sp.last_login_at) from public.staff_profiles sp where sp.store_id=s.id),'epoch'::timestamptz),
        s.created_at
      )<now()-interval '30 days'
    ),
    'orders_30d',(select count(*) from public.orders where created_at>=now()-interval '30 days'),
    'revenue_30d',coalesce((
      select sum(o.total)
      from public.orders o
      join public.order_statuses st on st.store_id=o.store_id and st.name=o.status and st.is_completed=true
      where o.created_at>=now()-interval '30 days'
    ),0),
    'products_total',(select count(*) from public.products),
    'staff_total',(select count(*) from public.staff_profiles where active=true),
    'errors_24h',(select count(*) from public.client_error_log where created_at>=now()-interval '24 hours'),
    'visits_30d',coalesce((select sum(visits) from public.site_visit_daily where day>=current_date-29),0),
    'storage_bytes',coalesce((
      select sum(coalesce((metadata->>'size')::bigint,0))
      from storage.objects
      where bucket_id='store-images'
    ),0)
  ) into result;

  return result;
end;
$$;

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
      'id',s.id,
      'slug',s.slug,
      'name',s.name,
      'custom_domain',s.custom_domain,
      'status',s.status,
      'plan',s.plan,
      'subscription_status',s.subscription_status,
      'trial_ends_at',s.trial_ends_at,
      'paid_until',s.paid_until,
      'billing_note',s.billing_note,
      'created_at',s.created_at,
      'owner_email',coalesce(owner_profile.email,''),
      'owner_last_login_at',owner_profile.last_login_at,
      'products_count',(select count(*) from public.products p where p.store_id=s.id),
      'orders_count',(select count(*) from public.orders o where o.store_id=s.id),
      'orders_30d',(select count(*) from public.orders o where o.store_id=s.id and o.created_at>=now()-interval '30 days'),
      'staff_count',(select count(*) from public.staff_profiles sp where sp.store_id=s.id and sp.active=true),
      'last_order_at',(select max(o.created_at) from public.orders o where o.store_id=s.id),
      'last_visit_at',(select max(d.day)::timestamptz from public.site_visit_daily d where d.store_id=s.id),
      'errors_24h',(select count(*) from public.client_error_log e where e.store_id=s.id and e.created_at>=now()-interval '24 hours'),
      'setup_completed',coalesce((select ss.setup_completed from public.shop_settings ss where ss.store_id=s.id limit 1),false),
      'storage_bytes',coalesce((
        select sum(coalesce((o.metadata->>'size')::bigint,0))
        from storage.objects o
        where o.bucket_id='store-images' and o.name like s.id::text||'/%'
      ),0)
    ) order by s.created_at desc)
    from public.stores s
    left join lateral (
      select email,last_login_at
      from public.staff_profiles x
      where x.store_id=s.id and x.role='owner' and x.active=true
      order by x.created_at
      limit 1
    ) owner_profile on true
    where s.archived_at is null
  ),'[]'::jsonb);
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

  return jsonb_build_object(
    'code',code_value,
    'email',lower(btrim(email_input)),
    'expires_at',now()+interval '7 days'
  );
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
    update public.staff_profiles
    set role='viewer',active=false,permissions=array[]::text[],updated_at=now()
    where store_id=store_id_input and role='owner' and user_id<>auth.uid();
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
    update public.stores
    set owner_user_id=auth.uid(),updated_at=now(),last_platform_action_at=now()
    where id=store_id_input;
  end if;

  update public.staff_invites set used_at=now() where id=inv.id and store_id=store_id_input;
  return true;
end;
$$;

create or replace function public.platform_export_store(store_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from public.stores where id=store_id_input) then raise exception 'المتجر غير موجود'; end if;

  select jsonb_build_object(
    'exported_at',now(),
    'store',(select to_jsonb(s) from public.stores s where s.id=store_id_input),
    'settings',(select to_jsonb(ss) from public.shop_settings ss where ss.store_id=store_id_input limit 1),
    'categories',coalesce((select jsonb_agg(to_jsonb(x)) from public.categories x where x.store_id=store_id_input),'[]'::jsonb),
    'units',coalesce((select jsonb_agg(to_jsonb(x)) from public.selling_units x where x.store_id=store_id_input),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(x)) from public.products x where x.store_id=store_id_input),'[]'::jsonb),
    'product_options',coalesce((select jsonb_agg(to_jsonb(x)) from public.product_options x where x.store_id=store_id_input),'[]'::jsonb),
    'delivery_areas',coalesce((select jsonb_agg(to_jsonb(x)) from public.delivery_areas x where x.store_id=store_id_input),'[]'::jsonb),
    'order_statuses',coalesce((select jsonb_agg(to_jsonb(x)) from public.order_statuses x where x.store_id=store_id_input),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(to_jsonb(x)) from public.orders x where x.store_id=store_id_input),'[]'::jsonb),
    'order_items',coalesce((select jsonb_agg(to_jsonb(x)) from public.order_items x where x.store_id=store_id_input),'[]'::jsonb),
    'staff',coalesce((select jsonb_agg(to_jsonb(x)-'permissions') from public.staff_profiles x where x.store_id=store_id_input),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.platform_delete_store_record(store_id_input uuid,confirm_slug_input text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare st public.stores%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  select * into st from public.stores where id=store_id_input for update;
  if st.id is null then raise exception 'المتجر غير موجود'; end if;
  if st.status<>'suspended' then raise exception 'يجب إيقاف المتجر قبل الحذف النهائي'; end if;
  if lower(btrim(confirm_slug_input))<>st.slug then raise exception 'تأكيد اسم الرابط غير مطابق'; end if;

  delete from public.stores where id=store_id_input;
  delete from public.platform_support_sessions where store_id=store_id_input;
  return true;
end;
$$;

create or replace function public.platform_create_store(
  name_input text,
  slug_input text,
  owner_email_input text,
  custom_domain_input text,
  plan_input text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  sid uuid;
  slug_value text:=lower(btrim(coalesce(slug_input,'')));
  owner_email text:=lower(btrim(coalesce(owner_email_input,'')));
  code_value text;
  chosen_plan text:=coalesce(nullif(plan_input,''),'pro');
  chosen_features jsonb;
  trial_days integer:=14;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(name_input,'')))<2 then raise exception 'اسم المتجر مطلوب'; end if;
  if slug_value !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'رابط المتجر غير صحيح'; end if;
  if position('@' in owner_email)=0 then raise exception 'بريد المالك غير صحيح'; end if;

  select features into chosen_features from public.plan_catalog where id=chosen_plan and active=true;
  if chosen_features is null then raise exception 'الباقة غير موجودة'; end if;
  select default_trial_days into trial_days from public.platform_settings where id='main';

  insert into public.stores(
    slug,name,status,plan,subscription_status,trial_ends_at
  ) values(
    slug_value,left(btrim(name_input),120),'active',chosen_plan,'trial',
    now()+(coalesce(trial_days,14)*interval '1 day')
  ) returning id into sid;

  insert into public.shop_settings(
    id,store_id,store_name,site_name,welcome_message,setup_completed,public_site_url,feature_flags
  ) values(
    'store:'||slug_value,sid,left(btrim(name_input),120),left(btrim(name_input),120),
    'أهلاً بك',false,'',chosen_features
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

  insert into public.platform_billing_events(store_id,plan,subscription_status,paid_until,note,created_by)
  values(sid,chosen_plan,'trial',null,'إنشاء المتجر وبدء الفترة التجريبية',auth.uid());

  return jsonb_build_object(
    'store_id',sid,'slug',slug_value,'invite_code',code_value,
    'owner_email',owner_email,'plan',chosen_plan
  );
end;
$$;

revoke all on function public.platform_get_settings() from public;
revoke all on function public.platform_set_settings(text,integer,integer) from public;
revoke all on function public.platform_list_plans() from public;
revoke all on function public.platform_set_store_plan(uuid,text) from public;
revoke all on function public.platform_set_subscription(uuid,text,timestamptz,text) from public;
revoke all on function public.platform_start_support(uuid) from public;
revoke all on function public.platform_end_support() from public;
revoke all on function public.platform_support_status() from public;
revoke all on function public.platform_get_overview() from public;
revoke all on function public.platform_transfer_owner(uuid,text) from public;
revoke all on function public.platform_export_store(uuid) from public;
revoke all on function public.platform_delete_store_record(uuid,text) from public;
revoke all on function public.platform_create_store(text,text,text,text,text) from public;

grant execute on function public.platform_get_settings() to authenticated;
grant execute on function public.platform_set_settings(text,integer,integer) to authenticated;
grant execute on function public.platform_list_plans() to authenticated;
grant execute on function public.platform_set_store_plan(uuid,text) to authenticated;
grant execute on function public.platform_set_subscription(uuid,text,timestamptz,text) to authenticated;
grant execute on function public.platform_start_support(uuid) to authenticated;
grant execute on function public.platform_end_support() to authenticated;
grant execute on function public.platform_support_status() to authenticated;
grant execute on function public.platform_get_overview() to authenticated;
grant execute on function public.platform_transfer_owner(uuid,text) to authenticated;
grant execute on function public.platform_export_store(uuid) to authenticated;
grant execute on function public.platform_delete_store_record(uuid,text) to authenticated;
grant execute on function public.platform_create_store(text,text,text,text,text) to authenticated;
grant execute on function public.current_store_plan_status() to authenticated;

select 'SAAS PRODUCTIZATION READY' as result;
