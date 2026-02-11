create extension if not exists "pgcrypto";

create table if not exists order_packing_list_summary (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade unique,
  total_packages numeric,
  total_net_weight_kg numeric,
  total_gross_weight_kg numeric,
  total_cbm numeric,
  notes text,
  updated_at timestamptz not null default timezone('utc', now())
);
