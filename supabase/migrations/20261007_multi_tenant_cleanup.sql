-- Tenant-aware cleanup, restore, and retention RPCs.

create or replace function public.order_cleanup_password_set()
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare has_password boolean; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'غير مصرح'; end if;
  select coalesce(password_hash<>'',false) into has_password
  from public.order_cleanup_security where store_id=sid limit 1;
  return coalesce(has_password,false);
end;
$$;

create or replace function public.set_order_cleanup_password(password_input text,current_password_input text default '')
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  current_hash text; fail_count integer; lock_time timestamptz; already_set boolean:=false;
  sid uuid:=public.current_store_id(); security_id text;
begin
  if sid is null or not public.is_admin() then raise exception 'غير مصرح'; end if;
  if length(coalesce(password_input,''))<8 then raise exception 'كلمة مرور الحذف يجب أن تكون 8 أحرف على الأقل'; end if;

  select id,password_hash,failed_attempts,locked_until
  into security_id,current_hash,fail_count,lock_time
  from public.order_cleanup_security where store_id=sid for update;

  if security_id is null then
    security_id:='store:'||sid::text;
    insert into public.order_cleanup_security(id,store_id) values(security_id,sid);
  end if;

  already_set:=coalesce(current_hash,'')<>'';
  if already_set then
    if lock_time is not null and lock_time>now() then return jsonb_build_object('ok',false,'error','تم إيقاف محاولات كلمة مرور الحذف مؤقتًا. حاول لاحقًا.'); end if;
    if crypt(coalesce(current_password_input,''),current_hash)<>current_hash then
      fail_count:=coalesce(fail_count,0)+1;
      update public.order_cleanup_security
      set failed_attempts=case when fail_count>=5 then 0 else fail_count end,
          locked_until=case when fail_count>=5 then now()+interval '15 minutes' else null end,
          updated_at=now(),updated_by=auth.uid()
      where store_id=sid;
      return jsonb_build_object('ok',false,'error',case when fail_count>=5 then 'تم إيقاف المحاولات لمدة 15 دقيقة بسبب تكرار كلمة المرور الخاطئة.' else 'كلمة مرور الحذف الحالية غير صحيحة.' end);
    end if;
  end if;

  update public.order_cleanup_security
  set password_hash=crypt(password_input,gen_salt('bf',10)),failed_attempts=0,locked_until=null,updated_at=now(),updated_by=auth.uid()
  where store_id=sid;

  insert into public.order_cleanup_logs(store_id,admin_user_id,action,filter_type,filter_label,orders_count)
  values(sid,auth.uid(),'password_change','security',case when already_set then 'تغيير كلمة مرور الحذف' else 'تعيين كلمة مرور الحذف لأول مرة' end,0);

  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.preview_order_cleanup(date_from_input date,date_to_input date)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare total_count integer:=0; active_count integer:=0; archived_count integer:=0; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'غير مصرح'; end if;
  if date_from_input is null or date_to_input is null or date_from_input>date_to_input then raise exception 'الفترة المحددة غير صحيحة'; end if;

  select count(*)::integer,
         count(*) filter(where archived_at is null)::integer,
         count(*) filter(where archived_at is not null)::integer
  into total_count,active_count,archived_count
  from public.orders
  where store_id=sid
    and created_at>=date_from_input::timestamptz
    and created_at<(date_to_input+1)::timestamptz;

  return jsonb_build_object('count',total_count,'active_count',active_count,'archived_count',archived_count);
end;
$$;

create or replace function public.cleanup_orders(action_input text,date_from_input date,date_to_input date,filter_type_input text,filter_label_input text,password_input text default '')
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  affected integer:=0; min_created timestamptz; max_created timestamptz;
  password_hash_value text; fail_count integer; lock_time timestamptz;
  sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'غير مصرح'; end if;
  if action_input not in ('archive','delete') then raise exception 'الإجراء غير صحيح'; end if;
  if date_from_input is null or date_to_input is null or date_from_input>date_to_input then raise exception 'الفترة المحددة غير صحيحة'; end if;

  if action_input='archive' then
    select min(created_at),max(created_at) into min_created,max_created
    from public.orders
    where store_id=sid and created_at>=date_from_input::timestamptz and created_at<(date_to_input+1)::timestamptz and archived_at is null;

    update public.orders set archived_at=now(),archived_by=auth.uid()
    where store_id=sid and created_at>=date_from_input::timestamptz and created_at<(date_to_input+1)::timestamptz and archived_at is null;
    get diagnostics affected=row_count;
  else
    select password_hash,failed_attempts,locked_until into password_hash_value,fail_count,lock_time
    from public.order_cleanup_security where store_id=sid for update;

    if coalesce(password_hash_value,'')='' then return jsonb_build_object('ok',false,'error','يجب تعيين كلمة مرور الحذف أولًا'); end if;
    if lock_time is not null and lock_time>now() then return jsonb_build_object('ok',false,'error','تم إيقاف محاولات الحذف مؤقتًا. حاول لاحقًا.'); end if;

    if crypt(coalesce(password_input,''),password_hash_value)<>password_hash_value then
      fail_count:=coalesce(fail_count,0)+1;
      update public.order_cleanup_security
      set failed_attempts=case when fail_count>=5 then 0 else fail_count end,
          locked_until=case when fail_count>=5 then now()+interval '15 minutes' else null end,
          updated_at=now(),updated_by=auth.uid()
      where store_id=sid;
      return jsonb_build_object('ok',false,'error',case when fail_count>=5 then 'تم إيقاف محاولات الحذف لمدة 15 دقيقة بسبب تكرار كلمة المرور الخاطئة.' else 'كلمة مرور الحذف غير صحيحة.' end);
    end if;

    update public.order_cleanup_security set failed_attempts=0,locked_until=null where store_id=sid;

    select min(created_at),max(created_at) into min_created,max_created
    from public.orders
    where store_id=sid and created_at>=date_from_input::timestamptz and created_at<(date_to_input+1)::timestamptz and archived_at is not null;

    delete from public.orders
    where store_id=sid and created_at>=date_from_input::timestamptz and created_at<(date_to_input+1)::timestamptz and archived_at is not null;
    get diagnostics affected=row_count;
  end if;

  insert into public.order_cleanup_logs(store_id,admin_user_id,action,filter_type,filter_label,date_from,date_to,orders_count,min_order_created_at,max_order_created_at)
  values(sid,auth.uid(),action_input,left(coalesce(filter_type_input,''),40),left(coalesce(filter_label_input,''),180),date_from_input,date_to_input,affected,min_created,max_created);

  return jsonb_build_object('ok',true,'count',affected);
end;
$$;

create or replace function public.restore_archived_order(order_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare order_created timestamptz; order_number_value text; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'غير مصرح'; end if;

  select created_at,order_number into order_created,order_number_value
  from public.orders where store_id=sid and id=order_id_input and archived_at is not null for update;
  if order_created is null then raise exception 'الطلب المؤرشف غير موجود'; end if;

  update public.orders set archived_at=null,archived_by=null where store_id=sid and id=order_id_input;

  insert into public.order_cleanup_logs(store_id,admin_user_id,action,filter_type,filter_label,date_from,date_to,orders_count,min_order_created_at,max_order_created_at)
  values(sid,auth.uid(),'restore','single','استرجاع الطلب #'||coalesce(order_number_value,''),order_created::date,order_created::date,1,order_created,order_created);

  return true;
end;
$$;

create or replace function public.run_data_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare s public.shop_settings%rowtype; audit_count integer:=0; inventory_count integer:=0; visits_count integer:=0; sid uuid:=public.current_store_id();
begin
  if sid is null or not public.is_admin() then raise exception 'هذه العملية متاحة للمالك فقط'; end if;
  select * into s from public.shop_settings where store_id=sid limit 1;

  delete from public.admin_audit_log where store_id=sid and created_at<now()-(greatest(30,least(3650,coalesce(s.audit_retention_days,180)))*interval '1 day');
  get diagnostics audit_count=row_count;
  delete from public.inventory_adjustments where store_id=sid and created_at<now()-(greatest(30,least(3650,coalesce(s.inventory_retention_days,365)))*interval '1 day');
  get diagnostics inventory_count=row_count;
  delete from public.site_visit_daily where store_id=sid and day<current_date-greatest(30,least(3650,coalesce(s.visit_retention_days,180)));
  get diagnostics visits_count=row_count;

  return jsonb_build_object('audit_deleted',audit_count,'inventory_deleted',inventory_count,'visits_deleted',visits_count);
end;
$$;
