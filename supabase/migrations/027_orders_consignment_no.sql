-- 027_orders_consignment_no.sql
alter table public.orders
add column if not exists consignment_no text;
