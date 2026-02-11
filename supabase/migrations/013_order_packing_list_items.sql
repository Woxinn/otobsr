create extension if not exists "pgcrypto";

create table if not exists order_packing_list_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_code text,
  product_name text,
  quantity integer,
  packages integer,
  weight_kg numeric(12, 2),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

drop trigger if exists order_packing_list_items_set_updated_at on order_packing_list_items;
create trigger order_packing_list_items_set_updated_at
before update on order_packing_list_items
for each row execute function set_updated_at();

alter table order_packing_list_items disable row level security;
