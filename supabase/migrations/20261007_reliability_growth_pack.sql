-- Reliability, tracking, anti-spam, maintenance and staff session metadata.
-- Lightweight by design: no new high-growth analytics tables.

alter table public.shop_settings
  add column if not exists announcement_enabled boolean not null default false,
  add column if not exists announcement_text text not null default '',
  add column if not exists maintenance_mode boolean not null default false,
  add column if not exists maintenance_message text not null default 'المتجر تحت الصيانة مؤقتًا. نعود قريبًا.';

alter table public.staff_profiles
  add column if not exists last_login_at timestamptz;

alter table public.orders
  add column if not exists tracking_token text;

create unique index if not exists idx_orders_tracking_token
  on public.orders(tracking_token)
  where tracking_token is not null;

create index if not exists idx_orders_phone_created_at
  on public.orders(customer_phone,created_at desc);

create or replace function public.record_staff_login()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  update public.staff_profiles
  set last_login_at=now(),updated_at=now()
  where user_id=auth.uid() and active=true;
  return found;
end;
$$;

revoke all on function public.record_staff_login() from public;
grant execute on function public.record_staff_login() to authenticated;

create or replace function public.claim_order_tracking(
  order_id_input uuid,
  client_token_input text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  current_tracking text;
  current_client text;
begin
  if coalesce(btrim(client_token_input),'')='' then raise exception 'بيانات التتبع غير صحيحة'; end if;

  select tracking_token,client_token
  into current_tracking,current_client
  from public.orders
  where id=order_id_input
  for update;

  if not found or coalesce(current_client,'')<>left(btrim(client_token_input),100) then
    raise exception 'تعذر إنشاء رابط التتبع';
  end if;

  if coalesce(current_tracking,'')='' then
    current_tracking:=lower(encode(gen_random_bytes(18),'hex'));
    update public.orders set tracking_token=current_tracking where id=order_id_input;
  end if;

  return current_tracking;
end;
$$;

revoke all on function public.claim_order_tracking(uuid,text) from public;
grant execute on function public.claim_order_tracking(uuid,text) to anon, authenticated;

create or replace function public.get_public_order_tracking(tracking_token_input text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ord public.orders%rowtype;
  events_value jsonb;
begin
  if length(coalesce(btrim(tracking_token_input),''))<20 then
    raise exception 'رابط التتبع غير صحيح';
  end if;

  select * into ord
  from public.orders
  where tracking_token=btrim(tracking_token_input)
    and archived_at is null;

  if ord.id is null then raise exception 'تعذر العثور على الطلب'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('created_at',x.created_at,'summary',x.summary)
    order by x.created_at
  ),'[]'::jsonb)
  into events_value
  from (
    select created_at,summary
    from public.order_events
    where order_id=ord.id
      and event_type in ('created','status')
    order by created_at desc
    limit 30
  ) x;

  return jsonb_build_object(
    'order_number',ord.order_number,
    'created_at',ord.created_at,
    'status',ord.status,
    'requested_time',ord.requested_time,
    'total',ord.total,
    'events',events_value
  );
end;
$$;

revoke all on function public.get_public_order_tracking(text) from public;
grant execute on function public.get_public_order_tracking(text) to anon, authenticated;

create or replace function public.enforce_order_guardrails()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  s public.shop_settings%rowtype;
  phone_digits text;
  recent_count integer;
  daily_count integer;
begin
  select * into s from public.shop_settings where id='main';
  if coalesce(s.maintenance_mode,false) then
    raise exception 'المتجر تحت الصيانة حاليًا ولا يستقبل طلبات جديدة';
  end if;

  phone_digits:=regexp_replace(coalesce(new.customer_phone,''),'[^0-9]','','g');
  if phone_digits<>'' then
    select count(*)::integer into recent_count
    from public.orders
    where regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')=phone_digits
      and created_at>now()-interval '10 minutes';

    if recent_count>=4 then
      raise exception 'تم إرسال عدة طلبات خلال وقت قصير. حاول مرة أخرى بعد قليل';
    end if;

    select count(*)::integer into daily_count
    from public.orders
    where regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')=phone_digits
      and created_at>now()-interval '24 hours';

    if daily_count>=12 then
      raise exception 'تم الوصول للحد المؤقت لعدد الطلبات. تواصل مع المتجر إذا كنت تحتاج مساعدة';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_order_guardrails() from public, anon, authenticated;

drop trigger if exists trg_order_guardrails on public.orders;
create trigger trg_order_guardrails
before insert on public.orders
for each row execute function public.enforce_order_guardrails();

select 'RELIABILITY GROWTH PACK MIGRATION SUCCESS' as result;
