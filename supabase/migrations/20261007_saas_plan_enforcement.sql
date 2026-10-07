-- SaaS plan enforcement hardening.

create or replace function public.store_plan_feature_allowed(store_id_input uuid,feature_key text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select coalesce((p.features->>feature_key)::boolean,false)
  from public.stores s
  join public.plan_catalog p on p.id=s.plan
  where s.id=store_id_input;
$$;

create or replace function public.enforce_settings_plan_features()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare allowed jsonb;
begin
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

drop trigger if exists trg_settings_plan_features on public.shop_settings;
create trigger trg_settings_plan_features
before insert or update on public.shop_settings
for each row execute function public.enforce_settings_plan_features();

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
  set feature_flags=f,
      scheduled_orders_enabled=case when coalesce((f->>'scheduled_orders')::boolean,false) then scheduled_orders_enabled else false end,
      delivery_capacity_enabled=case when coalesce((f->>'scheduled_orders')::boolean,false) then delivery_capacity_enabled else false end,
      updated_at=now()
  where store_id=store_id_input;

  insert into public.platform_billing_events(store_id,plan,subscription_status,paid_until,note,created_by)
  select id,plan,subscription_status,paid_until,'تغيير الباقة',auth.uid()
  from public.stores where id=store_id_input;

  return true;
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
  allowed_permissions text[]:=array['orders.view','orders.manage','products.manage','inventory.manage','prices.manage','reports.view','settings.manage'];
  max_value integer;
  active_count integer;
  pending_count integer;
begin
  if sid is null or not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  if not public.store_plan_feature_allowed(sid,'staff') then raise exception 'إدارة الموظفين غير متاحة في الباقة الحالية'; end if;
  if position('@' in coalesce(email_input,''))=0 then raise exception 'البريد الإلكتروني غير صحيح'; end if;
  if length(btrim(coalesce(job_title_input,'')))<2 then raise exception 'اكتب المسمى الوظيفي'; end if;
  if coalesce(cardinality(permissions_input),0)=0 then raise exception 'اختر صلاحية واحدة على الأقل'; end if;
  if exists(select 1 from unnest(permissions_input) p where not (p=any(allowed_permissions))) then raise exception 'توجد صلاحية غير مسموحة'; end if;

  select p.max_staff into max_value
  from public.stores s join public.plan_catalog p on p.id=s.plan
  where s.id=sid;

  if max_value is not null then
    select count(*)::integer into active_count from public.staff_profiles where store_id=sid and active=true;
    select count(*)::integer into pending_count from public.staff_invites where store_id=sid and used_at is null and expires_at>now() and role<>'owner';
    if active_count+pending_count>=max_value then
      raise exception 'وصل المتجر للحد الأقصى للحسابات في الباقة الحالية (% حسابات).',max_value;
    end if;
  end if;

  delete from public.staff_invites where store_id=sid and (used_at is not null or expires_at<now());
  code_value:=upper(encode(gen_random_bytes(12),'hex'));

  insert into public.staff_invites(store_id,email,role,permissions,code_hash,created_by,job_title)
  values(sid,lower(btrim(email_input)),'viewer',permissions_input,encode(digest(code_value,'sha256'),'hex'),auth.uid(),left(btrim(job_title_input),100));

  return jsonb_build_object('code',code_value,'expires_at',now()+interval '7 days');
end;
$$;

create or replace function public.record_inventory_adjustment(
  product_id_input uuid,option_id_input uuid,before_input numeric,after_input numeric,reason_input text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  p_name text:=''; o_name text:=''; retention_days integer:=365; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('inventory.manage') then raise exception 'غير مصرح'; end if;
  if not public.store_plan_feature_allowed(sid,'inventory') then raise exception 'المخزون غير متاح في الباقة الحالية'; end if;
  if product_id_input is not null then select name_ar into p_name from public.products where store_id=sid and id=product_id_input; end if;
  if option_id_input is not null then select name_ar into o_name from public.product_options where store_id=sid and id=option_id_input; end if;

  insert into public.inventory_adjustments(store_id,actor_user_id,product_id,product_name,option_id,option_name,quantity_before,quantity_after,delta,reason)
  values(sid,auth.uid(),product_id_input,coalesce(p_name,''),option_id_input,coalesce(o_name,''),before_input,after_input,coalesce(after_input,0)-coalesce(before_input,0),left(coalesce(reason_input,'تعديل يدوي'),200));

  select coalesce(inventory_retention_days,365) into retention_days from public.shop_settings where store_id=sid limit 1;
  delete from public.inventory_adjustments
  where store_id=sid and created_at < now()-(greatest(30,least(3650,retention_days))*interval '1 day');
  return true;
end;
$$;

create or replace function public.schedule_option_price(option_id_input uuid,price_input numeric,old_price_input numeric,starts_at_input timestamptz)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare new_id uuid; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.has_permission('prices.manage') then raise exception 'غير مصرح'; end if;
  if not public.store_plan_feature_allowed(sid,'scheduled_prices') then raise exception 'جدولة الأسعار غير متاحة في الباقة الحالية'; end if;
  if price_input<0 then raise exception 'السعر غير صحيح'; end if;
  if starts_at_input<=now() then raise exception 'اختر وقتًا في المستقبل'; end if;
  if not exists(select 1 from public.product_options where store_id=sid and id=option_id_input) then raise exception 'الخيار غير موجود'; end if;

  delete from public.scheduled_prices where store_id=sid and product_option_id=option_id_input;
  insert into public.scheduled_prices(store_id,product_option_id,price,old_price,starts_at,created_by)
  values(sid,option_id_input,price_input,old_price_input,starts_at_input,auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.store_plan_feature_allowed(uuid,text) to authenticated;
