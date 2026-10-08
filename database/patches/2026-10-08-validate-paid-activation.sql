-- Staged only: prevents marking a subscription active without future paid-through date.
-- No changes to existing store records; has effect only after a future approved deployment.
CREATE OR REPLACE FUNCTION public.platform_set_subscription(store_id_input uuid, status_input text, paid_until_input timestamp with time zone, note_input text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare st public.stores%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'غير مصرح'; end if;
  if status_input not in ('trial','active','past_due','paused') then raise exception 'حالة الاشتراك غير صحيحة'; end if;
  if status_input='active' and (paid_until_input is null or paid_until_input<=now()) then
    raise exception 'تفعيل الاشتراك يتطلب تاريخ سداد مستقبلي';
  end if;

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
$function$
;
