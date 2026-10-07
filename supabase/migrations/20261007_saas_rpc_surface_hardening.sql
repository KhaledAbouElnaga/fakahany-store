-- Reduce exposed SECURITY DEFINER surface while keeping required public storefront RPCs.

revoke execute on function public.audit_platform_store_change() from anon,authenticated;
revoke execute on function public.audit_admin_change() from anon,authenticated;
revoke execute on function public.enforce_product_plan_limit() from anon,authenticated;
revoke execute on function public.enforce_staff_plan_limit() from anon,authenticated;
revoke execute on function public.enforce_settings_plan_features() from anon,authenticated;
revoke execute on function public.enforce_order_guardrails() from anon,authenticated;
revoke execute on function public.apply_default_order_status() from anon,authenticated;

revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_platform_admin() from anon;
revoke execute on function public.is_staff() from anon;
revoke execute on function public.has_permission(text) from anon;
revoke execute on function public.current_staff_profile() from anon;
revoke execute on function public.claim_first_admin() from anon;
revoke execute on function public.claim_staff_invite(text,text) from anon;
revoke execute on function public.claim_staff_invite(uuid,text,text) from anon;
revoke execute on function public.create_custom_staff_invite(text,text,text[]) from anon;
revoke execute on function public.create_staff_invite(text,text,text[]) from anon;
revoke execute on function public.record_staff_login() from anon;
revoke execute on function public.update_custom_staff_member(uuid,text,text[],boolean) from anon;
revoke execute on function public.update_staff_member(uuid,text,boolean) from anon;
revoke execute on function public.remove_staff_member(uuid) from anon;
revoke execute on function public.current_store_plan_status() from anon;
revoke execute on function public.self_service_create_store(text,text) from anon;
revoke execute on function public.create_support_ticket(text,text,text) from anon;
revoke execute on function public.list_store_support_tickets() from anon;

-- Internal/legacy helpers are not public endpoints.
revoke execute on function public.default_store_id() from anon;
revoke execute on function public.apply_due_scheduled_prices() from anon;
revoke execute on function public.log_order_event(uuid,text,text) from anon;
