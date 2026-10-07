-- SaaS productization security/performance hardening.

create index if not exists idx_platform_billing_created_by on public.platform_billing_events(created_by);
create index if not exists idx_platform_settings_updated_by on public.platform_settings(updated_by);

revoke all on function public.active_support_store_id() from public;
grant execute on function public.active_support_store_id() to authenticated;

revoke all on function public.current_store_id() from public;
grant execute on function public.current_store_id() to authenticated;

revoke all on function public.current_store_plan_status() from public;
grant execute on function public.current_store_plan_status() to authenticated;

revoke all on function public.store_plan_feature_allowed(uuid,text) from public;
grant execute on function public.store_plan_feature_allowed(uuid,text) to authenticated;

revoke all on function public.enforce_product_plan_limit() from public;
revoke all on function public.enforce_staff_plan_limit() from public;
revoke all on function public.enforce_settings_plan_features() from public;

-- Support helpers are never part of the anonymous storefront surface.
revoke execute on function public.active_support_store_id() from anon;
revoke execute on function public.current_store_id() from anon;
revoke execute on function public.current_store_plan_status() from anon;
revoke execute on function public.store_plan_feature_allowed(uuid,text) from anon;
