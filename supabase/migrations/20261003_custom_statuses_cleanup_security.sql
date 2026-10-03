-- Custom order statuses + hardened archive/cleanup controls
-- Run after 20261003_order_cleanup.sql

create table if not exists public.order_statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  note text not null default '',
  display_order integer not null default 0,
  active boolean not null default true,
  is_new boolean not null default false,
  is_completed boolean not null default false,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.order_statuses(id,name,note,display_order,active,is_new,is_completed,is_cancelled)
values
('00000000-0000-0000-0000-000000000101','جديد','طلب جديد لم يبدأ التعامل معه بعد.',1,true,true,false,false),
('00000000-0000-0000-0000-000000000102','جاري التجهيز','الطلب قيد التجهيز.',2,true,false,false,false),
('00000000-0000-0000-0000-000000000103','خرج للتوصيل','تم تجهيز الطلب وخرج للتوصيل.',3,true,false,false,false),
('00000000-0000-0000-0000-000000000104','مكتمل','تم إنهاء الطلب بنجاح.',4,true,false,true,false),
('00000000-0000-0000-0000-000000000105','ملغي','تم إلغاء الطلب.',5,true,false,false,true)
on conflict (id) do nothing;

alter table public.order_statuses enable row level security;
drop policy if exists "admins manage order statuses" on public.order_statuses;
create policy "admins manage order statuses"
on public.order_statuses for all
using (public.is_admin())
with check (public.is_admin());

revoke all on public.order_statuses from anon, authenticated;
grant select, insert, update on public.order_statuses to authenticated;

-- Remove the old fixed list check from orders.status.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='orders'
      and c.contype='c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.orders drop constraint if exists %I', r.conname);
  end loop;
end $$;

create or replace function public.save_order_status_definition(
  status_id_input uuid,
  name_input text,
  note_input text,
  display_order_input integer,
  active_input boolean,
  is_new_input boolean,
  is_completed_input boolean,
  is_cancelled_input boolean
)
returns public.order_statuses
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_name text;
  result_row public.order_statuses%rowtype;
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;
  if btrim(coalesce(name_input,''))='' then raise exception 'اسم الحالة مطلوب'; end if;
  if length(btrim(name_input))>80 then raise exception 'اسم الحالة طويل جدًا'; end if;
  if (case when is_new_input then 1 else 0 end)
     +(case when is_completed_input then 1 else 0 end)
     +(case when is_cancelled_input then 1 else 0 end) > 1 then
    raise exception 'الحالة لا يمكن أن تكون جديدة ومكتملة وملغية في نفس الوقت';
  end if;

  select name into old_name from public.order_statuses where id=status_id_input for update;

  insert into public.order_statuses(
    id,name,note,display_order,active,is_new,is_completed,is_cancelled,updated_at
  ) values (
    status_id_input,
    btrim(name_input),
    left(coalesce(note_input,''),300),
    coalesce(display_order_input,0),
    coalesce(active_input,true),
    coalesce(is_new_input,false),
    coalesce(is_completed_input,false),
    coalesce(is_cancelled_input,false),
    now()
  )
  on conflict (id) do update set
    name=excluded.name,
    note=excluded.note,
    display_order=excluded.display_order,
    active=excluded.active,
    is_new=excluded.is_new,
    is_completed=excluded.is_completed,
    is_cancelled=excluded.is_cancelled,
    updated_at=now()
  returning * into result_row;

  if old_name is not null and old_name<>result_row.name then
    update public.orders set status=result_row.name where status=old_name;
  end if;

  return result_row;
end;
$$;

revoke all on function public.save_order_status_definition(uuid,text,text,integer,boolean,boolean,boolean,boolean) from public;
grant execute on function public.save_order_status_definition(uuid,text,text,integer,boolean,boolean,boolean,boolean) to authenticated;

-- New orders continue to be created by the existing RPC, but this trigger
-- maps its legacy "جديد" value to the configurable new-order status.
create or replace function public.apply_default_order_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare default_name text;
begin
  if new.status is null or btrim(new.status)='' or new.status='جديد' then
    select name into default_name
    from public.order_statuses
    where active=true and is_new=true
    order by display_order,id
    limit 1;
    new.status := coalesce(default_name,'جديد');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_default_order_status on public.orders;
create trigger trg_apply_default_order_status
before insert on public.orders
for each row execute function public.apply_default_order_status();

create or replace function public.set_order_status(order_id_input uuid, new_status text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_status text;
  old_cancelled boolean := false;
  new_cancelled boolean := false;
  i public.order_items%rowtype;
  p public.products%rowtype;
  o public.product_options%rowtype;
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;

  if not exists(
    select 1 from public.order_statuses
    where name=new_status and active=true
  ) then
    raise exception 'حالة الطلب غير متاحة';
  end if;

  select status into old_status
  from public.orders
  where id=order_id_input
  for update;

  if old_status is null then raise exception 'الطلب غير موجود'; end if;
  if old_status = new_status then return true; end if;

  select coalesce(is_cancelled,false) into old_cancelled
  from public.order_statuses where name=old_status;
  old_cancelled := coalesce(old_cancelled, old_status='ملغي');

  select coalesce(is_cancelled,false) into new_cancelled
  from public.order_statuses where name=new_status;
  new_cancelled := coalesce(new_cancelled,false);

  if new_cancelled and not old_cancelled then
    for i in select * from public.order_items where order_id=order_id_input loop
      select * into p from public.products where id=i.product_id for update;
      select * into o from public.product_options where id=i.option_id for update;
      if p.id is not null and p.track_stock then
        update public.products set stock_qty=coalesce(stock_qty,0)+i.quantity,updated_at=now() where id=p.id;
      end if;
      if o.id is not null and o.track_stock then
        update public.product_options set stock_qty=coalesce(stock_qty,0)+i.quantity where id=o.id;
      end if;
    end loop;
  elsif old_cancelled and not new_cancelled then
    for i in select * from public.order_items where order_id=order_id_input loop
      select * into p from public.products where id=i.product_id for update;
      select * into o from public.product_options where id=i.option_id for update;
      if p.id is not null and p.track_stock and coalesce(p.stock_qty,0)<i.quantity then
        raise exception 'لا يوجد مخزون كاف لإعادة تفعيل الطلب';
      end if;
      if o.id is not null and o.track_stock and coalesce(o.stock_qty,0)<i.quantity then
        raise exception 'لا يوجد مخزون كاف لإعادة تفعيل الطلب';
      end if;
      if p.id is not null and p.track_stock then
        update public.products set stock_qty=coalesce(stock_qty,0)-i.quantity,updated_at=now() where id=p.id;
      end if;
      if o.id is not null and o.track_stock then
        update public.product_options set stock_qty=coalesce(stock_qty,0)-i.quantity where id=o.id;
      end if;
    end loop;
  end if;

  update public.orders set status=new_status where id=order_id_input;
  return true;
end;
$$;

revoke all on function public.set_order_status(uuid,text) from public;
grant execute on function public.set_order_status(uuid,text) to authenticated;

-- Harden cleanup password changes and failed attempts.
alter table public.order_cleanup_security
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

-- Extend audit action list to include password changes.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='order_cleanup_logs'
      and c.contype='c'
      and pg_get_constraintdef(c.oid) ilike '%action%'
  loop
    execute format('alter table public.order_cleanup_logs drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.order_cleanup_logs
  add constraint order_cleanup_logs_action_check
  check (action in ('archive','delete','restore','password_change'));

drop function if exists public.set_order_cleanup_password(text);

create or replace function public.set_order_cleanup_password(
  password_input text,
  current_password_input text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  current_hash text;
  fail_count integer;
  lock_time timestamptz;
  already_set boolean := false;
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;
  if length(coalesce(password_input,'')) < 8 then
    raise exception 'كلمة مرور الحذف يجب أن تكون 8 أحرف على الأقل';
  end if;

  select password_hash,failed_attempts,locked_until
  into current_hash,fail_count,lock_time
  from public.order_cleanup_security
  where id='main'
  for update;

  already_set := coalesce(current_hash,'')<>'';

  if already_set then
    if lock_time is not null and lock_time>now() then
      return jsonb_build_object('ok',false,'error','تم إيقاف محاولات كلمة مرور الحذف مؤقتًا. حاول لاحقًا.');
    end if;

    if crypt(coalesce(current_password_input,''),current_hash)<>current_hash then
      fail_count := coalesce(fail_count,0)+1;
      update public.order_cleanup_security
      set failed_attempts=case when fail_count>=5 then 0 else fail_count end,
          locked_until=case when fail_count>=5 then now()+interval '15 minutes' else null end,
          updated_at=now(),
          updated_by=auth.uid()
      where id='main';

      return jsonb_build_object(
        'ok',false,
        'error',case when fail_count>=5
          then 'تم إيقاف المحاولات لمدة 15 دقيقة بسبب تكرار كلمة المرور الخاطئة.'
          else 'كلمة مرور الحذف الحالية غير صحيحة.'
        end
      );
    end if;
  end if;

  insert into public.order_cleanup_security(
    id,password_hash,failed_attempts,locked_until,updated_at,updated_by
  )
  values(
    'main',
    crypt(password_input,gen_salt('bf',10)),
    0,
    null,
    now(),
    auth.uid()
  )
  on conflict(id) do update set
    password_hash=excluded.password_hash,
    failed_attempts=0,
    locked_until=null,
    updated_at=now(),
    updated_by=auth.uid();

  insert into public.order_cleanup_logs(
    admin_user_id,action,filter_type,filter_label,orders_count
  )
  values(
    auth.uid(),
    'password_change',
    'security',
    case when already_set then 'تغيير كلمة مرور الحذف' else 'تعيين كلمة مرور الحذف لأول مرة' end,
    0
  );

  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.set_order_cleanup_password(text,text) from public;
grant execute on function public.set_order_cleanup_password(text,text) to authenticated;

create or replace function public.cleanup_orders(
  action_input text,
  date_from_input date,
  date_to_input date,
  filter_type_input text,
  filter_label_input text,
  password_input text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  affected integer := 0;
  min_created timestamptz;
  max_created timestamptz;
  password_hash_value text;
  fail_count integer;
  lock_time timestamptz;
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;
  if action_input not in ('archive','delete') then raise exception 'الإجراء غير صحيح'; end if;
  if date_from_input is null or date_to_input is null or date_from_input>date_to_input then
    raise exception 'الفترة المحددة غير صحيحة';
  end if;

  if action_input='archive' then
    select min(created_at),max(created_at)
    into min_created,max_created
    from public.orders
    where created_at>=date_from_input::timestamptz
      and created_at<(date_to_input+1)::timestamptz
      and archived_at is null;

    update public.orders
    set archived_at=now(),archived_by=auth.uid()
    where created_at>=date_from_input::timestamptz
      and created_at<(date_to_input+1)::timestamptz
      and archived_at is null;

    get diagnostics affected=row_count;
  else
    select password_hash,failed_attempts,locked_until
    into password_hash_value,fail_count,lock_time
    from public.order_cleanup_security
    where id='main'
    for update;

    if coalesce(password_hash_value,'')='' then
      return jsonb_build_object('ok',false,'error','يجب تعيين كلمة مرور الحذف أولًا');
    end if;

    if lock_time is not null and lock_time>now() then
      return jsonb_build_object('ok',false,'error','تم إيقاف محاولات الحذف مؤقتًا. حاول لاحقًا.');
    end if;

    if crypt(coalesce(password_input,''),password_hash_value)<>password_hash_value then
      fail_count := coalesce(fail_count,0)+1;
      update public.order_cleanup_security
      set failed_attempts=case when fail_count>=5 then 0 else fail_count end,
          locked_until=case when fail_count>=5 then now()+interval '15 minutes' else null end,
          updated_at=now(),
          updated_by=auth.uid()
      where id='main';

      return jsonb_build_object(
        'ok',false,
        'error',case when fail_count>=5
          then 'تم إيقاف محاولات الحذف لمدة 15 دقيقة بسبب تكرار كلمة المرور الخاطئة.'
          else 'كلمة مرور الحذف غير صحيحة.'
        end
      );
    end if;

    update public.order_cleanup_security
    set failed_attempts=0,locked_until=null
    where id='main';

    -- Permanent deletion is intentionally restricted to archived orders.
    select min(created_at),max(created_at)
    into min_created,max_created
    from public.orders
    where created_at>=date_from_input::timestamptz
      and created_at<(date_to_input+1)::timestamptz
      and archived_at is not null;

    delete from public.orders
    where created_at>=date_from_input::timestamptz
      and created_at<(date_to_input+1)::timestamptz
      and archived_at is not null;

    get diagnostics affected=row_count;
  end if;

  insert into public.order_cleanup_logs(
    admin_user_id,action,filter_type,filter_label,date_from,date_to,
    orders_count,min_order_created_at,max_order_created_at
  )
  values(
    auth.uid(),action_input,left(coalesce(filter_type_input,''),40),
    left(coalesce(filter_label_input,''),180),date_from_input,date_to_input,
    affected,min_created,max_created
  );

  return jsonb_build_object('ok',true,'count',affected);
end;
$$;

revoke all on function public.cleanup_orders(text,date,date,text,text,text) from public;
grant execute on function public.cleanup_orders(text,date,date,text,text,text) to authenticated;

select 'CUSTOM STATUSES AND CLEANUP SECURITY MIGRATION SUCCESS' as result;
