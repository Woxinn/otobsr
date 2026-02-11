create extension if not exists "pgcrypto";

create table if not exists product_extra_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  unit text,
  value_type text not null default 'text',
  value_text text,
  value_number numeric(14, 4),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

drop trigger if exists product_extra_attributes_set_updated_at on product_extra_attributes;
create trigger product_extra_attributes_set_updated_at
before update on product_extra_attributes
for each row execute function set_updated_at();

alter table product_extra_attributes disable row level security;
