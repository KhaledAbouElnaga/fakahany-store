-- Small indexes for anti-spam checks. These prevent full order-table scans as order volume grows.
create index if not exists idx_orders_phone_digits_created_at
on public.orders ((regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')), created_at desc);

create index if not exists idx_orders_device_prefix_created_at
on public.orders ((split_part(coalesce(client_token,''),'.',1)), created_at desc);

select 'RELIABILITY INDEXES MIGRATION SUCCESS' as result;
