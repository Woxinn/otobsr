create extension if not exists "pgcrypto";

create table if not exists shipment_orders (
  shipment_id uuid not null references shipments(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  created_at timestamp with time zone default now(),
  primary key (shipment_id, order_id)
);

alter table shipment_orders disable row level security;
