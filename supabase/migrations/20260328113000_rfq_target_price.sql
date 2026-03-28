alter table if exists rfq_items
add column if not exists target_unit_price numeric(18,6);
