create extension if not exists "pgcrypto";

create table if not exists product_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists product_attributes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references product_groups(id) on delete cascade,
  name text not null,
  unit text,
  value_type text not null default 'number',
  is_required boolean default false,
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (group_id, name)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  group_id uuid references product_groups(id) on delete set null,
  description text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  attribute_id uuid not null references product_attributes(id) on delete cascade,
  value_text text,
  value_number numeric(14, 4),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (product_id, attribute_id)
);

create table if not exists supplier_product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  supplier_name text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (product_id, supplier_id)
);

drop trigger if exists product_groups_set_updated_at on product_groups;
create trigger product_groups_set_updated_at
before update on product_groups
for each row execute function set_updated_at();

drop trigger if exists product_attributes_set_updated_at on product_attributes;
create trigger product_attributes_set_updated_at
before update on product_attributes
for each row execute function set_updated_at();

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at
before update on products
for each row execute function set_updated_at();

drop trigger if exists product_attribute_values_set_updated_at on product_attribute_values;
create trigger product_attribute_values_set_updated_at
before update on product_attribute_values
for each row execute function set_updated_at();

drop trigger if exists supplier_product_aliases_set_updated_at on supplier_product_aliases;
create trigger supplier_product_aliases_set_updated_at
before update on supplier_product_aliases
for each row execute function set_updated_at();

alter table product_groups disable row level security;
alter table product_attributes disable row level security;
alter table products disable row level security;
alter table product_attribute_values disable row level security;
alter table supplier_product_aliases disable row level security;
