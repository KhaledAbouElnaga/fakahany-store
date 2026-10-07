-- Require a short-lived email reauthentication code before permanent store deletion.

create or replace function public.platform_authorize_store_delete(
  store_id_input uuid,
  confirm_slug_input text,
  code_input text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  st public.stores%rowtype;
  user_email text;
  stored_token text;
  sent_at timestamptz;
  expected_hash text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'غير مصرح';
  end if;

  select * into st
  from public.stores
  where id=store_id_input
  for update;

  if st.id is null then raise exception 'المتجر غير موجود'; end if;
  if st.status<>'suspended' then raise exception 'يجب إيقاف المتجر قبل الحذف النهائي'; end if;
  if lower(btrim(coalesce(confirm_slug_input,'')))<>st.slug then
    raise exception 'تأكيد اسم الرابط غير مطابق';
  end if;
  if btrim(coalesce(code_input,'')) !~ '^[0-9]{6}$' then
    raise exception 'كود التأكيد يجب أن يكون 6 أرقام';
  end if;

  select email,reauthentication_token,reauthentication_sent_at
  into user_email,stored_token,sent_at
  from auth.users
  where id=auth.uid()
  for update;

  if coalesce(user_email,'')='' then raise exception 'لا يوجد بريد إلكتروني لحساب إدارة المنصة'; end if;
  if coalesce(stored_token,'')='' or sent_at is null then
    raise exception 'اطلب كود تأكيد جديد من البريد الإلكتروني';
  end if;
  if sent_at < now()-interval '10 minutes' then
    update auth.users
    set reauthentication_token='',reauthentication_sent_at=null
    where id=auth.uid();
    raise exception 'انتهت صلاحية كود التأكيد. اطلب كودًا جديدًا';
  end if;

  expected_hash:=encode(digest(user_email||btrim(code_input),'sha224'),'hex');
  if expected_hash<>stored_token then
    raise exception 'كود التأكيد غير صحيح';
  end if;

  -- One-time use.
  update auth.users
  set reauthentication_token='',reauthentication_sent_at=null
  where id=auth.uid();

  perform public.platform_write_audit(
    st.id,
    'store_delete_authorized',
    'تم تأكيد الحذف النهائي عبر البريد الإلكتروني',
    jsonb_build_object('store_slug',st.slug)
  );

  return jsonb_build_object(
    'ok',true,
    'store_id',st.id,
    'store_slug',st.slug,
    'email',user_email
  );
end;
$$;

revoke all on function public.platform_authorize_store_delete(uuid,text,text) from public;
grant execute on function public.platform_authorize_store_delete(uuid,text,text) to authenticated;

select 'DELETE EMAIL CONFIRMATION READY' as result;
