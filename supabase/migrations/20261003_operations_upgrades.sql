-- Operations upgrades: staff permissions, order timeline, notes, alerts support,
-- customer history support, lightweight inventory adjustments, scheduled prices,
-- delivery capacity, duplicate protection, daily reports, and transactional order editing.
-- Run after 20261003_custom_statuses_cleanup_security.sql

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Settings and order fields ----------
alter table public.shop_settings
  add column if not exists delivery_capacity_enabled boolean not null default false,
  add column if not exists delivery_slot_minutes integer not null default 60,
  add column if not exists delivery_slot_capacity integer not null default 0;

alter table public.orders
  add column if not exists requested_for timestamptz,
  add column if not exists internal_note text not null default '',
  add column if not exists client_token text;

create unique index if not exists idx_orders_client_token
  on public.orders(client_token)
  where client_token is not null and client_token <> '';

create index if not exists idx_orders_phone_created
  on public.orders(customer_phone, created_at desc);

create index if not exists idx_orders_requested_for
  on public.orders(requested_for)
  where requested_for is not null;

-- ---------- Staff roles and permissions ----------
create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'viewer'
    check (role in ('owner','manager','orders','inventory','viewer')),
  active boolean not null default true,
  permissions text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.staff_profiles(user_id,email,display_name,role,active,permissions)
select a.user_id, coalesce(u.email,''), coalesce(split_part(u.email,'@',1),''), 'owner', true, array['*']
from public.admins a
left join auth.users u on u.id=a.user_id
on conflict (user_id) do nothing;

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('manager','orders','inventory','viewer')),
  permissions text[] not null default array[]::text[],
  code_hash text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  used_at timestamptz
);

create index if not exists idx_staff_invites_expiry on public.staff_invites(expires_at);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.staff_profiles s
    where s.user_id=auth.uid() and s.active=true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.staff_profiles s
    where s.user_id=auth.uid() and s.active=true and s.role='owner'
  );
$$;

create or replace function public.has_permission(permission_input text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1 from public.staff_profiles s
    where s.user_id=auth.uid()
      and s.active=true
      and (
        s.role='owner'
        or '*'=any(s.permissions)
        or permission_input=any(s.permissions)
      )
  );
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.has_permission(text) from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.claim_first_admin()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $
declare user_email text;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  perform pg_advisory_xact_lock(hashtext('fakahany.claim_first_admin'));

  if exists(select 1 from public.admins) then
    if exists(select 1 from public.staff_profiles where user_id=auth.uid() and role='owner' and active=true) then return true; end if;
    raise exception 'تم تعيين المدير الأول بالفعل';
  end if;

  select coalesce(email,'') into user_email from auth.users where id=auth.uid();
  insert into public.admins(user_id) values(auth.uid()) on conflict do nothing;
  insert into public.staff_profiles(user_id,email,display_name,role,active,permissions)
  values(auth.uid(),user_email,coalesce(split_part(user_email,'@',1),'المالك'),'owner',true,array['*'])
  on conflict(user_id) do update set role='owner',active=true,permissions=array['*'],updated_at=now();

  return true;
end;
$;

revoke all on function public.claim_first_admin() from public;
grant execute on function public.claim_first_admin() to authenticated;

create or replace function public.current_staff_profile()
returns public.staff_profiles
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select * from public.staff_profiles where user_id=auth.uid() and active=true limit 1;
$$;

revoke all on function public.current_staff_profile() from public;
grant execute on function public.current_staff_profile() to authenticated;

create or replace function public.create_staff_invite(
  email_input text,
  role_input text,
  display_permissions text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  code_value text;
begin
  if not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if role_input not in ('manager','orders','inventory','viewer') then raise exception 'الدور غير صحيح'; end if;
  if position('@' in coalesce(email_input,''))=0 then raise exception 'البريد الإلكتروني غير صحيح'; end if;

  delete from public.staff_invites where used_at is not null or expires_at<now();
  code_value := upper(encode(gen_random_bytes(12),'hex'));

  insert into public.staff_invites(email,role,permissions,code_hash,created_by)
  values(
    lower(btrim(email_input)),
    role_input,
    coalesce(display_permissions,array[]::text[]),
    encode(digest(code_value,'sha256'),'hex'),
    auth.uid()
  );

  return jsonb_build_object('code',code_value,'expires_at',now()+interval '7 days');
end;
$$;

revoke all on function public.create_staff_invite(text,text,text[]) from public;
grant execute on function public.create_staff_invite(text,text,text[]) to authenticated;

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

  select * into inv
  from public.staff_invites
  where code_hash=encode(digest(upper(btrim(code_input)),'sha256'),'hex')
    and used_at is null
    and expires_at>now()
  for update;

  if inv.id is null then raise exception 'كود الدعوة غير صحيح أو انتهت صلاحيته'; end if;
  if lower(inv.email)<>current_email then raise exception 'الدعوة مخصصة لبريد إلكتروني مختلف'; end if;

  perms := case inv.role
    when 'manager' then array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage']
    when 'orders' then array['orders.view','orders.manage','reports.view']
    when 'inventory' then array['products.manage','inventory.manage','prices.manage']
    else array['orders.view','reports.view']
  end;

  if cardinality(inv.permissions)>0 then perms:=inv.permissions; end if;

  insert into public.admins(user_id) values(auth.uid()) on conflict do nothing;
  insert into public.staff_profiles(user_id,email,display_name,role,active,permissions)
  values(auth.uid(),current_email,left(coalesce(display_name_input,''),100),inv.role,true,perms)
  on conflict(user_id) do update set
    email=excluded.email,
    display_name=excluded.display_name,
    role=excluded.role,
    active=true,
    permissions=excluded.permissions,
    updated_at=now();

  update public.staff_invites set used_at=now() where id=inv.id;
  return true;
end;
$$;

revoke all on function public.claim_staff_invite(text,text) from public;
grant execute on function public.claim_staff_invite(text,text) to authenticated;

create or replace function public.update_staff_member(
  user_id_input uuid,
  role_input text,
  active_input boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare perms text[];
begin
  if not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if user_id_input=auth.uid() and active_input=false then raise exception 'لا يمكنك تعطيل حساب المالك الحالي'; end if;
  if role_input not in ('owner','manager','orders','inventory','viewer') then raise exception 'الدور غير صحيح'; end if;

  perms := case role_input
    when 'owner' then array['*']
    when 'manager' then array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage']
    when 'orders' then array['orders.view','orders.manage','reports.view']
    when 'inventory' then array['products.manage','inventory.manage','prices.manage']
    else array['orders.view','reports.view']
  end;

  update public.staff_profiles
  set role=role_input,active=active_input,permissions=perms,updated_at=now()
  where user_id=user_id_input;

  if not found then raise exception 'الموظف غير موجود'; end if;
  return true;
end;
$$;

revoke all on function public.update_staff_member(uuid,text,boolean) from public;
grant execute on function public.update_staff_member(uuid,text,boolean) to authenticated;

-- ---------- Lightweight order timeline ----------
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  event_type text not null,
  summary text not null
);

create index if not exists idx_order_events_order_created
  on public.order_events(order_id,created_at desc);

create or replace function public.log_order_event(
  order_id_input uuid,
  event_type_input text,
  summary_input text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.order_events(order_id,actor_user_id,event_type,summary)
  values(order_id_input,auth.uid(),left(coalesce(event_type_input,''),40),left(coalesce(summary_input,''),300));

  delete from public.order_events
  where id in (
    select id from public.order_events
    where order_id=order_id_input
    order by created_at desc
    offset 100
  );
end;
$$;

revoke all on function public.log_order_event(uuid,text,text) from public;

create or replace function public.set_order_internal_note(order_id_input uuid, note_input text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_permission('orders.manage') then raise exception 'غير مصرح'; end if;
  update public.orders set internal_note=left(coalesce(note_input,''),2000) where id=order_id_input;
  if not found then raise exception 'الطلب غير موجود'; end if;
  perform public.log_order_event(order_id_input,'internal_note','تم تعديل الملاحظة الداخلية');
  return true;
end;
$$;

revoke all on function public.set_order_internal_note(uuid,text) from public;
grant execute on function public.set_order_internal_note(uuid,text) to authenticated;

-- ---------- Lightweight manual inventory adjustment log ----------
create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null default '',
  option_id uuid references public.product_options(id) on delete set null,
  option_name text not null default '',
  quantity_before numeric,
  quantity_after numeric,
  delta numeric not null default 0,
  reason text not null default ''
);

create index if not exists idx_inventory_adjustments_created
  on public.inventory_adjustments(created_at desc);

create or replace function public.record_inventory_adjustment(
  product_id_input uuid,
  option_id_input uuid,
  before_input numeric,
  after_input numeric,
  reason_input text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare p_name text:=''; o_name text:='';
begin
  if not public.has_permission('inventory.manage') then raise exception 'غير مصرح'; end if;
  if product_id_input is not null then select name_ar into p_name from public.products where id=product_id_input; end if;
  if option_id_input is not null then select name_ar into o_name from public.product_options where id=option_id_input; end if;

  insert into public.inventory_adjustments(
    actor_user_id,product_id,product_name,option_id,option_name,
    quantity_before,quantity_after,delta,reason
  ) values(
    auth.uid(),product_id_input,coalesce(p_name,''),option_id_input,coalesce(o_name,''),
    before_input,after_input,coalesce(after_input,0)-coalesce(before_input,0),left(coalesce(reason_input,'تعديل يدوي'),200)
  );

  delete from public.inventory_adjustments
  where created_at < now()-interval '365 days';

  return true;
end;
$$;

revoke all on function public.record_inventory_adjustment(uuid,uuid,numeric,numeric,text) from public;
grant execute on function public.record_inventory_adjustment(uuid,uuid,numeric,numeric,text) to authenticated;

-- ---------- Scheduled prices: pending rows are deleted once applied ----------
create table if not exists public.scheduled_prices (
  id uuid primary key default gen_random_uuid(),
  product_option_id uuid not null references public.product_options(id) on delete cascade,
  price numeric(12,2) not null check(price>=0),
  old_price numeric(12,2) check(old_price is null or old_price>=0),
  starts_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_prices_due on public.scheduled_prices(starts_at);

create or replace function public.apply_due_scheduled_prices()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.scheduled_prices%rowtype; applied integer:=0;
begin
  for r in
    select * from public.scheduled_prices
    where starts_at<=now()
    order by starts_at
    for update skip locked
  loop
    update public.product_options set price=r.price,old_price=r.old_price where id=r.product_option_id;
    delete from public.scheduled_prices where id=r.id;
    applied:=applied+1;
  end loop;
  return applied;
end;
$$;

revoke all on function public.apply_due_scheduled_prices() from public;
grant execute on function public.apply_due_scheduled_prices() to anon, authenticated;

create or replace function public.schedule_option_price(
  option_id_input uuid,
  price_input numeric,
  old_price_input numeric,
  starts_at_input timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare new_id uuid;
begin
  if not public.has_permission('prices.manage') then raise exception 'غير مصرح'; end if;
  if price_input<0 then raise exception 'السعر غير صحيح'; end if;
  if starts_at_input<=now() then raise exception 'اختر وقتًا في المستقبل'; end if;
  if not exists(select 1 from public.product_options where id=option_id_input) then raise exception 'الخيار غير موجود'; end if;

  delete from public.scheduled_prices where product_option_id=option_id_input;
  insert into public.scheduled_prices(product_option_id,price,old_price,starts_at,created_by)
  values(option_id_input,price_input,old_price_input,starts_at_input,auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.cancel_scheduled_price(id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_permission('prices.manage') then raise exception 'غير مصرح'; end if;
  delete from public.scheduled_prices where id=id_input;
  return true;
end;
$$;

revoke all on function public.schedule_option_price(uuid,numeric,numeric,timestamptz) from public;
revoke all on function public.cancel_scheduled_price(uuid) from public;
grant execute on function public.schedule_option_price(uuid,numeric,numeric,timestamptz) to authenticated;
grant execute on function public.cancel_scheduled_price(uuid) to authenticated;

-- ---------- Order creation: idempotency + delivery capacity ----------
create or replace function public.create_store_order(order_payload jsonb, items_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  s public.shop_settings%rowtype;
  item jsonb;
  p public.products%rowtype;
  o public.product_options%rowtype;
  a public.delivery_areas%rowtype;
  q numeric;
  line_total numeric;
  subtotal numeric:=0;
  delivery numeric:=0;
  final_total numeric:=0;
  area_name_value text:='';
  order_id_value uuid:=(order_payload->>'id')::uuid;
  order_number_value text:=btrim(coalesce(order_payload->>'order_number',''));
  customer_name_value text:=btrim(coalesce(order_payload->>'customer_name',''));
  customer_phone_value text:=btrim(coalesce(order_payload->>'customer_phone',''));
  address_value text:=btrim(coalesce(order_payload->>'address',''));
  notes_value text:=btrim(coalesce(order_payload->>'notes',''));
  requested_time_value text:=btrim(coalesce(order_payload->>'requested_time',''));
  requested_for_value timestamptz:=nullif(order_payload->>'requested_for','')::timestamptz;
  client_token_value text:=left(btrim(coalesce(order_payload->>'client_token','')),100);
  result_items jsonb:='[]'::jsonb;
  existing public.orders%rowtype;
  slot_start timestamptz;
  slot_end timestamptz;
  slot_seconds integer;
  slot_count integer;
begin
  perform public.apply_due_scheduled_prices();

  if client_token_value<>'' then
    select * into existing from public.orders where client_token=client_token_value;
    if existing.id is not null then
      return jsonb_build_object(
        'ok',true,'duplicate',true,'order_id',existing.id,
        'product_subtotal',existing.product_subtotal,'delivery_fee',existing.delivery_fee,
        'total',existing.total,'area_name',existing.area_name,'requested_time',existing.requested_time,
        'items','[]'::jsonb
      );
    end if;
  end if;

  select * into s from public.shop_settings where id='main';
  if s.id is null then raise exception 'إعدادات المتجر غير موجودة'; end if;
  if s.store_status_mode='closed' then raise exception 'المحل مغلق حاليًا'; end if;
  if order_number_value='' or length(order_number_value)>40 then raise exception 'رقم الطلب غير صحيح'; end if;
  if s.require_name and customer_name_value='' then raise exception 'الاسم مطلوب'; end if;
  if s.require_phone and customer_phone_value='' then raise exception 'رقم الهاتف مطلوب'; end if;
  if s.require_address and address_value='' then raise exception 'العنوان مطلوب'; end if;
  if s.require_notes and notes_value='' then raise exception 'الملاحظات مطلوبة'; end if;
  if customer_name_value<>'' and length(customer_name_value)>120 then raise exception 'الاسم طويل جدًا'; end if;
  if customer_phone_value<>'' and length(customer_phone_value)>30 then raise exception 'رقم الهاتف طويل جدًا'; end if;
  if address_value<>'' and length(address_value)>500 then raise exception 'العنوان طويل جدًا'; end if;
  if notes_value<>'' and length(notes_value)>1000 then raise exception 'الملاحظات طويلة جدًا'; end if;

  if customer_phone_value<>'' then
    if length(regexp_replace(customer_phone_value,'[^0-9]','','g'))<10
       or length(regexp_replace(customer_phone_value,'[^0-9]','','g'))>15 then
      raise exception 'رقم الهاتف غير صحيح';
    end if;
  end if;

  if s.scheduled_orders_enabled and requested_time_value<>'' and requested_time_value<>'في أقرب وقت' and requested_for_value is null then
    raise exception 'موعد الطلب غير صحيح';
  end if;

  if s.delivery_capacity_enabled and s.delivery_slot_capacity>0 and requested_for_value is not null then
    slot_seconds:=greatest(15,least(240,s.delivery_slot_minutes))*60;
    slot_start:=date_trunc('day',requested_for_value)
      + floor(extract(epoch from (requested_for_value-date_trunc('day',requested_for_value)))/slot_seconds)*slot_seconds*interval '1 second';
    slot_end:=slot_start+slot_seconds*interval '1 second';

    select count(*)::integer into slot_count
    from public.orders ord
    left join public.order_statuses st on st.name=ord.status
    where ord.archived_at is null
      and ord.requested_for>=slot_start and ord.requested_for<slot_end
      and coalesce(st.is_cancelled,false)=false;

    if slot_count>=s.delivery_slot_capacity then raise exception 'الفترة المختارة ممتلئة. اختر موعدًا آخر'; end if;
  end if;

  if jsonb_array_length(coalesce(items_payload,'[]'::jsonb))=0 then raise exception 'السلة فارغة'; end if;

  for item in select * from jsonb_array_elements(items_payload) loop
    q:=coalesce((item->>'quantity')::numeric,0);
    if q<=0 or q<>trunc(q) or q>999 then raise exception 'كمية غير صحيحة'; end if;

    select * into p from public.products where id=(item->>'product_id')::uuid for update;
    if p.id is null or p.hidden or not p.available then raise exception 'أحد المنتجات لم يعد متاحًا'; end if;

    select * into o from public.product_options
    where id=(item->>'option_id')::uuid and product_id=p.id for update;
    if o.id is null or not o.available then raise exception 'أحد خيارات المنتج لم يعد متاحًا'; end if;

    if p.track_stock and coalesce(p.stock_qty,0)<q then raise exception 'الكمية المطلوبة غير متاحة من المنتج: %',p.name_ar; end if;
    if o.track_stock and coalesce(o.stock_qty,0)<q then raise exception 'الكمية المطلوبة غير متاحة من الخيار: % - %',p.name_ar,o.name_ar; end if;

    line_total:=o.price*q;
    subtotal:=subtotal+line_total;
    result_items:=result_items||jsonb_build_array(jsonb_build_object('id',item->>'id','unit_price',o.price,'line_total',line_total));
  end loop;

  if subtotal<s.min_order then raise exception 'قيمة المنتجات أقل من الحد الأدنى للطلب'; end if;

  if s.delivery_enabled then
    if s.require_area and exists(select 1 from public.delivery_areas where enabled=true)
       and nullif(order_payload->>'area_id','') is null then raise exception 'منطقة التوصيل مطلوبة'; end if;

    if nullif(order_payload->>'area_id','') is not null then
      select * into a from public.delivery_areas where id=(order_payload->>'area_id')::uuid and enabled=true;
      if a.id is null then raise exception 'منطقة التوصيل غير متاحة'; end if;
      delivery:=a.fee;area_name_value:=a.name_ar;
    else delivery:=s.default_delivery_fee;
    end if;
  end if;

  final_total:=subtotal+delivery;

  insert into public.orders(
    id,order_number,customer_name,customer_phone,address,area_id,area_name,
    product_subtotal,delivery_fee,total,notes,requested_time,requested_for,
    client_token,status
  ) values(
    order_id_value,order_number_value,customer_name_value,customer_phone_value,address_value,
    case when s.delivery_enabled and nullif(order_payload->>'area_id','') is not null then (order_payload->>'area_id')::uuid else null end,
    area_name_value,subtotal,delivery,final_total,notes_value,
    case when s.scheduled_orders_enabled then requested_time_value else '' end,
    case when s.scheduled_orders_enabled then requested_for_value else null end,
    nullif(client_token_value,''),'جديد'
  );

  for item in select * from jsonb_array_elements(items_payload) loop
    q:=(item->>'quantity')::numeric;
    select * into p from public.products where id=(item->>'product_id')::uuid for update;
    select * into o from public.product_options where id=(item->>'option_id')::uuid and product_id=p.id for update;
    line_total:=o.price*q;

    insert into public.order_items(id,order_id,product_id,product_name,option_id,option_name,unit_price,quantity,line_total)
    values((item->>'id')::uuid,order_id_value,p.id,p.name_ar,o.id,o.name_ar,o.price,q,line_total);

    if p.track_stock then update public.products set stock_qty=greatest(0,coalesce(stock_qty,0)-q),updated_at=now() where id=p.id; end if;
    if o.track_stock then update public.product_options set stock_qty=greatest(0,coalesce(stock_qty,0)-q) where id=o.id; end if;
  end loop;

  perform public.log_order_event(order_id_value,'created','تم إنشاء الطلب');

  return jsonb_build_object(
    'ok',true,'duplicate',false,'order_id',order_id_value,
    'product_subtotal',subtotal,'delivery_fee',delivery,'total',final_total,
    'area_name',area_name_value,
    'requested_time',case when s.scheduled_orders_enabled then requested_time_value else '' end,
    'items',result_items
  );
end;
$$;

revoke all on function public.create_store_order(jsonb,jsonb) from public;
grant execute on function public.create_store_order(jsonb,jsonb) to anon, authenticated;

-- ---------- Status updates with timeline ----------
create or replace function public.set_order_status(order_id_input uuid,new_status text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_status text;
  old_cancelled boolean:=false;
  new_cancelled boolean:=false;
  i public.order_items%rowtype;
  p public.products%rowtype;
  o public.product_options%rowtype;
begin
  if not public.has_permission('orders.manage') then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from public.order_statuses where name=new_status and active=true) then raise exception 'حالة الطلب غير متاحة'; end if;

  select status into old_status from public.orders where id=order_id_input for update;
  if old_status is null then raise exception 'الطلب غير موجود'; end if;
  if old_status=new_status then return true; end if;

  select coalesce(is_cancelled,false) into old_cancelled from public.order_statuses where name=old_status;
  old_cancelled:=coalesce(old_cancelled,old_status='ملغي');
  select coalesce(is_cancelled,false) into new_cancelled from public.order_statuses where name=new_status;
  new_cancelled:=coalesce(new_cancelled,false);

  if new_cancelled and not old_cancelled then
    for i in select * from public.order_items where order_id=order_id_input loop
      select * into p from public.products where id=i.product_id for update;
      select * into o from public.product_options where id=i.option_id for update;
      if p.id is not null and p.track_stock then update public.products set stock_qty=coalesce(stock_qty,0)+i.quantity,updated_at=now() where id=p.id; end if;
      if o.id is not null and o.track_stock then update public.product_options set stock_qty=coalesce(stock_qty,0)+i.quantity where id=o.id; end if;
    end loop;
  elsif old_cancelled and not new_cancelled then
    for i in select * from public.order_items where order_id=order_id_input loop
      select * into p from public.products where id=i.product_id for update;
      select * into o from public.product_options where id=i.option_id for update;
      if p.id is not null and p.track_stock and coalesce(p.stock_qty,0)<i.quantity then raise exception 'لا يوجد مخزون كاف لإعادة تفعيل الطلب'; end if;
      if o.id is not null and o.track_stock and coalesce(o.stock_qty,0)<i.quantity then raise exception 'لا يوجد مخزون كاف لإعادة تفعيل الطلب'; end if;
      if p.id is not null and p.track_stock then update public.products set stock_qty=coalesce(stock_qty,0)-i.quantity,updated_at=now() where id=p.id; end if;
      if o.id is not null and o.track_stock then update public.product_options set stock_qty=coalesce(stock_qty,0)-i.quantity where id=o.id; end if;
    end loop;
  end if;

  update public.orders set status=new_status where id=order_id_input;
  perform public.log_order_event(order_id_input,'status','تم تغيير الحالة من «'||old_status||'» إلى «'||new_status||'»');
  return true;
end;
$$;

revoke all on function public.set_order_status(uuid,text) from public;
grant execute on function public.set_order_status(uuid,text) to authenticated;

-- ---------- Transactional order editing ----------
create or replace function public.edit_store_order(order_id_input uuid,order_payload jsonb,items_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ord public.orders%rowtype;
  s public.shop_settings%rowtype;
  st public.order_statuses%rowtype;
  item jsonb;
  p public.products%rowtype;
  o public.product_options%rowtype;
  a public.delivery_areas%rowtype;
  old_item public.order_items%rowtype;
  q numeric;
  subtotal numeric:=0;
  delivery numeric:=0;
  final_total numeric:=0;
  area_name_value text:='';
  requested_for_value timestamptz:=nullif(order_payload->>'requested_for','')::timestamptz;
begin
  if not public.has_permission('orders.manage') then raise exception 'غير مصرح'; end if;
  perform public.apply_due_scheduled_prices();

  select * into ord from public.orders where id=order_id_input for update;
  if ord.id is null then raise exception 'الطلب غير موجود'; end if;
  select * into s from public.shop_settings where id='main';
  select * into st from public.order_statuses where name=ord.status;

  -- If the order is active, restore its old stock first. Transaction rollback protects failures.
  if not coalesce(st.is_cancelled,false) then
    for old_item in select * from public.order_items where order_id=order_id_input loop
      select * into p from public.products where id=old_item.product_id for update;
      select * into o from public.product_options where id=old_item.option_id for update;
      if p.id is not null and p.track_stock then update public.products set stock_qty=coalesce(stock_qty,0)+old_item.quantity,updated_at=now() where id=p.id; end if;
      if o.id is not null and o.track_stock then update public.product_options set stock_qty=coalesce(stock_qty,0)+old_item.quantity where id=o.id; end if;
    end loop;
  end if;

  if jsonb_array_length(coalesce(items_payload,'[]'::jsonb))=0 then raise exception 'يجب أن يحتوي الطلب على منتج واحد على الأقل'; end if;

  for item in select * from jsonb_array_elements(items_payload) loop
    q:=coalesce((item->>'quantity')::numeric,0);
    if q<=0 or q<>trunc(q) or q>999 then raise exception 'كمية غير صحيحة'; end if;
    select * into p from public.products where id=(item->>'product_id')::uuid for update;
    select * into o from public.product_options where id=(item->>'option_id')::uuid and product_id=p.id for update;
    if p.id is null or o.id is null then raise exception 'أحد المنتجات أو الخيارات لم يعد موجودًا'; end if;

    if not coalesce(st.is_cancelled,false) then
      if p.track_stock and coalesce(p.stock_qty,0)<q then raise exception 'المخزون غير كاف للمنتج: %',p.name_ar; end if;
      if o.track_stock and coalesce(o.stock_qty,0)<q then raise exception 'المخزون غير كاف للخيار: % - %',p.name_ar,o.name_ar; end if;
    end if;
    subtotal:=subtotal+o.price*q;
  end loop;

  if s.delivery_enabled then
    if nullif(order_payload->>'area_id','') is not null then
      select * into a from public.delivery_areas where id=(order_payload->>'area_id')::uuid and enabled=true;
      if a.id is null then raise exception 'منطقة التوصيل غير متاحة'; end if;
      delivery:=a.fee;area_name_value:=a.name_ar;
    else
      delivery:=s.default_delivery_fee;
    end if;
  end if;

  final_total:=subtotal+delivery;

  delete from public.order_items where order_id=order_id_input;

  for item in select * from jsonb_array_elements(items_payload) loop
    q:=(item->>'quantity')::numeric;
    select * into p from public.products where id=(item->>'product_id')::uuid for update;
    select * into o from public.product_options where id=(item->>'option_id')::uuid and product_id=p.id for update;

    insert into public.order_items(id,order_id,product_id,product_name,option_id,option_name,unit_price,quantity,line_total)
    values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),order_id_input,p.id,p.name_ar,o.id,o.name_ar,o.price,q,o.price*q);

    if not coalesce(st.is_cancelled,false) then
      if p.track_stock then update public.products set stock_qty=coalesce(stock_qty,0)-q,updated_at=now() where id=p.id; end if;
      if o.track_stock then update public.product_options set stock_qty=coalesce(stock_qty,0)-q where id=o.id; end if;
    end if;
  end loop;

  update public.orders set
    customer_name=left(btrim(coalesce(order_payload->>'customer_name',customer_name)),120),
    customer_phone=left(btrim(coalesce(order_payload->>'customer_phone',customer_phone)),30),
    address=left(btrim(coalesce(order_payload->>'address',address)),500),
    area_id=case when s.delivery_enabled and nullif(order_payload->>'area_id','') is not null then (order_payload->>'area_id')::uuid else null end,
    area_name=area_name_value,
    product_subtotal=subtotal,
    delivery_fee=delivery,
    total=final_total,
    notes=left(coalesce(order_payload->>'notes',notes),1000),
    requested_time=left(coalesce(order_payload->>'requested_time',requested_time),120),
    requested_for=requested_for_value
  where id=order_id_input;

  perform public.log_order_event(order_id_input,'edit','تم تعديل محتويات الطلب وإعادة حساب الإجمالي');

  return jsonb_build_object('ok',true,'product_subtotal',subtotal,'delivery_fee',delivery,'total',final_total,'area_name',area_name_value);
end;
$$;

revoke all on function public.edit_store_order(uuid,jsonb,jsonb) from public;
grant execute on function public.edit_store_order(uuid,jsonb,jsonb) to authenticated;

-- ---------- RLS ----------
alter table public.staff_profiles enable row level security;
alter table public.staff_invites enable row level security;
alter table public.order_events enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.scheduled_prices enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='staff_profiles' loop execute format('drop policy if exists %I on public.staff_profiles',r.policyname); end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='staff_invites' loop execute format('drop policy if exists %I on public.staff_invites',r.policyname); end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='order_events' loop execute format('drop policy if exists %I on public.order_events',r.policyname); end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='inventory_adjustments' loop execute format('drop policy if exists %I on public.inventory_adjustments',r.policyname); end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='scheduled_prices' loop execute format('drop policy if exists %I on public.scheduled_prices',r.policyname); end loop;
end $$;

create policy "staff read own profile" on public.staff_profiles for select using (user_id=auth.uid() or public.is_admin());
create policy "owner manages staff profiles" on public.staff_profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "owner reads staff invites" on public.staff_invites for select using (public.is_admin());
create policy "staff read order events" on public.order_events for select using (public.has_permission('orders.view'));
create policy "inventory staff read adjustments" on public.inventory_adjustments for select using (public.has_permission('inventory.manage') or public.has_permission('reports.view'));
create policy "price staff read schedules" on public.scheduled_prices for select using (public.has_permission('prices.manage'));

-- Replace broad admin manage policies with permission-aware policies where relevant.
drop policy if exists "admins manage categories" on public.categories;
drop policy if exists "admins manage units" on public.selling_units;
drop policy if exists "admins manage products" on public.products;
drop policy if exists "admins manage options" on public.product_options;
drop policy if exists "admins manage settings" on public.shop_settings;
drop policy if exists "admins manage areas" on public.delivery_areas;
drop policy if exists "admins read orders" on public.orders;
drop policy if exists "admins update orders" on public.orders;
drop policy if exists "admins delete orders" on public.orders;
drop policy if exists "admins read order items" on public.order_items;
drop policy if exists "admins update order items" on public.order_items;
drop policy if exists "admins delete order items" on public.order_items;
drop policy if exists "admins manage order statuses" on public.order_statuses;
drop policy if exists "admins read visits" on public.site_visits;

create policy "staff manage categories" on public.categories for all using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy "staff manage units" on public.selling_units for all using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy "staff manage products" on public.products for all using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy "staff manage options" on public.product_options for all using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy "staff manage settings" on public.shop_settings for all using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy "staff manage areas" on public.delivery_areas for all using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy "staff read orders" on public.orders for select using (public.has_permission('orders.view'));
create policy "staff read order items" on public.order_items for select using (public.has_permission('orders.view'));
create policy "staff manage order statuses" on public.order_statuses for all using (public.has_permission('orders.manage')) with check (public.has_permission('orders.manage'));
create policy "staff read visits" on public.site_visits for select using (public.has_permission('reports.view'));

revoke all on public.staff_profiles,public.staff_invites,public.order_events,public.inventory_adjustments,public.scheduled_prices from anon,authenticated;
grant select on public.staff_profiles,public.order_events,public.inventory_adjustments,public.scheduled_prices to authenticated;
grant select on public.staff_invites to authenticated;

-- Storage writes: products or settings editors.
drop policy if exists "fakahany_admin_upload_images" on storage.objects;
drop policy if exists "fakahany_admin_update_images" on storage.objects;
drop policy if exists "fakahany_admin_delete_images" on storage.objects;
create policy "fakahany_staff_upload_images" on storage.objects for insert to authenticated with check (bucket_id='store-images' and (public.has_permission('products.manage') or public.has_permission('settings.manage')));
create policy "fakahany_staff_update_images" on storage.objects for update to authenticated using (bucket_id='store-images' and (public.has_permission('products.manage') or public.has_permission('settings.manage'))) with check (bucket_id='store-images');
create policy "fakahany_staff_delete_images" on storage.objects for delete to authenticated using (bucket_id='store-images' and (public.has_permission('products.manage') or public.has_permission('settings.manage')));

-- Realtime order inserts for browser alerts without storing notifications.
do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

select 'OPERATIONS UPGRADES MIGRATION SUCCESS' as result;
