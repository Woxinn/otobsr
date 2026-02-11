create extension if not exists "pgcrypto";

alter table order_packing_list_items
  add column if not exists ctn_no text,
  add column if not exists net_weight_kg numeric(12, 2),
  add column if not exists gross_weight_kg numeric(12, 2);

update order_packing_list_items
set net_weight_kg = weight_kg
where net_weight_kg is null
  and weight_kg is not null;

update order_packing_list_items
set gross_weight_kg = weight_kg
where gross_weight_kg is null
  and weight_kg is not null;
