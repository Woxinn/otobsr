create extension if not exists "pgcrypto";

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  country text,
  tax_no text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists forwarders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists ports (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists document_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_required boolean default false,
  is_critical boolean default false,
  applies_to text default 'shipment',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  file_no text not null unique,
  reference text,
  notes text,
  tags text[] default '{}'::text[],
  supplier_id uuid references suppliers(id),
  forwarder_id uuid references forwarders(id),
  origin_port_id uuid references ports(id),
  destination_port_id uuid references ports(id),
  container_type text,
  container_no text,
  seal_no text,
  etd_planned date,
  atd_actual date,
  eta_current date,
  ata_actual date,
  customs_entry_date date,
  warehouse_delivery_date date,
  status text default 'Planlandi',
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  name text,
  reference_name text,
  supplier_id uuid references suppliers(id),
  packages integer,
  weight_kg numeric(12, 2),
  payment_method text,
  incoterm text,
  total_amount numeric(12, 2),
  extra_cost_percent numeric(8, 3),
  currency text default 'USD',
  expected_ready_date date,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

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
  unit_price numeric(12, 2),
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

create table if not exists supplier_product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  supplier_name text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (product_id, supplier_id)
);

create table if not exists shipment_orders (
  shipment_id uuid not null references shipments(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  created_at timestamp with time zone default now(),
  primary key (shipment_id, order_id)
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text,
  quantity integer,
  unit_price numeric(12, 2),
  total_amount numeric(12, 2),
  net_weight_kg numeric(12, 2),
  gross_weight_kg numeric(12, 2),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(12, 2),
  currency text default 'USD',
  payment_date date,
  method text,
  status text default 'Bekleniyor',
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  storage_path text,
  file_name text,
  document_type_id uuid references document_types(id),
  status text default 'Geldi',
  received_at date,
  notes text,
  uploaded_at timestamp with time zone default now()
);

create table if not exists order_packing_list_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_code text,
  product_name text,
  ctn_no text,
  quantity integer,
  packages integer,
  net_weight_kg numeric(12, 2),
  gross_weight_kg numeric(12, 2),
  weight_kg numeric(12, 2),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists eta_history (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  eta_date date not null,
  changed_at timestamp with time zone default now()
);

create table if not exists cargo_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  description text,
  packages integer,
  pallets integer,
  weight_kg numeric(12, 2),
  volume_cbm numeric(12, 2),
  invoice_amount numeric(12, 2),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references shipments(id) on delete set null,
  document_type_id uuid references document_types(id),
  status text default 'Bekleniyor',
  received_at date,
  notes text,
  storage_path text,
  file_name text,
  uploaded_at timestamp with time zone default now()
);

create table if not exists forwarder_quotes (
  id uuid primary key default gen_random_uuid(),
  forwarder_id uuid not null references forwarders(id) on delete cascade,
  shipment_id uuid not null references shipments(id) on delete cascade,
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  container_size text,
  free_time_days integer,
  route_option text,
  transit_days integer,
  valid_until date,
  notes text,
  is_selected boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  task_type text not null,
  status text default 'Acik',
  created_at timestamp with time zone default now(),
  closed_at timestamp with time zone,
  unique (shipment_id, task_type)
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists suppliers_set_updated_at on suppliers;
create trigger suppliers_set_updated_at
before update on suppliers
for each row execute function set_updated_at();

drop trigger if exists forwarders_set_updated_at on forwarders;
create trigger forwarders_set_updated_at
before update on forwarders
for each row execute function set_updated_at();

drop trigger if exists ports_set_updated_at on ports;
create trigger ports_set_updated_at
before update on ports
for each row execute function set_updated_at();

drop trigger if exists document_types_set_updated_at on document_types;
create trigger document_types_set_updated_at
before update on document_types
for each row execute function set_updated_at();

drop trigger if exists shipments_set_updated_at on shipments;
create trigger shipments_set_updated_at
before update on shipments
for each row execute function set_updated_at();

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
before update on orders
for each row execute function set_updated_at();

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

drop trigger if exists product_extra_attributes_set_updated_at on product_extra_attributes;
create trigger product_extra_attributes_set_updated_at
before update on product_extra_attributes
for each row execute function set_updated_at();

drop trigger if exists supplier_product_aliases_set_updated_at on supplier_product_aliases;
create trigger supplier_product_aliases_set_updated_at
before update on supplier_product_aliases
for each row execute function set_updated_at();

drop trigger if exists order_items_set_updated_at on order_items;
create trigger order_items_set_updated_at
before update on order_items
for each row execute function set_updated_at();

drop trigger if exists order_packing_list_items_set_updated_at on order_packing_list_items;
create trigger order_packing_list_items_set_updated_at
before update on order_packing_list_items
for each row execute function set_updated_at();

drop trigger if exists order_payments_set_updated_at on order_payments;
create trigger order_payments_set_updated_at
before update on order_payments
for each row execute function set_updated_at();

drop trigger if exists cargo_items_set_updated_at on cargo_items;
create trigger cargo_items_set_updated_at
before update on cargo_items
for each row execute function set_updated_at();

drop trigger if exists forwarder_quotes_set_updated_at on forwarder_quotes;
create trigger forwarder_quotes_set_updated_at
before update on forwarder_quotes
for each row execute function set_updated_at();

alter table suppliers disable row level security;
alter table forwarders disable row level security;
alter table ports disable row level security;
alter table document_types disable row level security;
alter table shipments disable row level security;
alter table orders disable row level security;
alter table product_groups disable row level security;
alter table product_attributes disable row level security;
alter table products disable row level security;
alter table product_attribute_values disable row level security;
alter table product_extra_attributes disable row level security;
alter table supplier_product_aliases disable row level security;
alter table shipment_orders disable row level security;
alter table order_items disable row level security;
alter table order_packing_list_items disable row level security;
alter table order_payments disable row level security;
alter table order_documents disable row level security;
alter table eta_history disable row level security;
alter table cargo_items disable row level security;
alter table documents disable row level security;
alter table forwarder_quotes disable row level security;
alter table tasks disable row level security;

alter table document_types add column if not exists code text;
update document_types set code = name where code is null;
alter table document_types alter column code set not null;
create unique index if not exists document_types_code_key on document_types (code);
create index if not exists order_items_product_id_idx on order_items (product_id);
alter table document_types add column if not exists applies_to text;

alter table cargo_items add column if not exists invoice_amount numeric(12, 2);
alter table suppliers add column if not exists contact_name text;
alter table suppliers add column if not exists email text;
alter table suppliers add column if not exists phone text;
alter table suppliers add column if not exists address text;
alter table suppliers add column if not exists city text;
alter table suppliers add column if not exists country text;
alter table suppliers add column if not exists tax_no text;
alter table forwarders add column if not exists contact_name text;
alter table forwarders add column if not exists email text;
alter table forwarders add column if not exists phone text;
alter table orders add column if not exists name text;
alter table orders alter column name drop not null;
alter table orders add column if not exists reference_name text;
alter table orders alter column reference_name drop not null;
alter table orders add column if not exists file_no text;
alter table orders alter column file_no drop not null;
alter table orders add column if not exists supplier_id uuid;
alter table orders add column if not exists packages integer;
alter table orders add column if not exists weight_kg numeric(12, 2);
alter table orders add column if not exists payment_method text;
alter table orders add column if not exists incoterm text;
alter table orders add column if not exists total_amount numeric(12, 2);
alter table orders add column if not exists extra_cost_percent numeric(8, 3);
alter table orders add column if not exists currency text;
alter table orders add column if not exists expected_ready_date date;
alter table orders add column if not exists notes text;
alter table products add column if not exists unit_price numeric(12, 2);
alter table shipment_orders add column if not exists shipment_id uuid;
alter table shipment_orders add column if not exists order_id uuid;
alter table order_items add column if not exists order_id uuid;
alter table order_items add column if not exists product_id uuid;
alter table order_items add column if not exists name text;
alter table order_items add column if not exists line_no integer;
alter table order_items add column if not exists quantity integer;
alter table order_items add column if not exists unit_price numeric(12, 2);
alter table order_items add column if not exists total_amount numeric(12, 2);
alter table order_items add column if not exists net_weight_kg numeric(12, 2);
alter table order_items add column if not exists gross_weight_kg numeric(12, 2);
alter table order_items add column if not exists notes text;
alter table order_packing_list_items add column if not exists order_id uuid;
alter table order_packing_list_items add column if not exists product_id uuid;
alter table order_packing_list_items add column if not exists product_code text;
alter table order_packing_list_items add column if not exists product_name text;
alter table order_packing_list_items add column if not exists ctn_no text;
alter table order_packing_list_items add column if not exists quantity integer;
alter table order_packing_list_items add column if not exists packages integer;
alter table order_packing_list_items add column if not exists net_weight_kg numeric(12, 2);
alter table order_packing_list_items add column if not exists gross_weight_kg numeric(12, 2);
alter table order_packing_list_items add column if not exists weight_kg numeric(12, 2);
alter table order_packing_list_items add column if not exists notes text;
alter table order_payments add column if not exists order_id uuid;
alter table order_payments add column if not exists amount numeric(12, 2);
alter table order_payments add column if not exists currency text;
alter table order_payments add column if not exists payment_date date;
alter table order_payments add column if not exists method text;
alter table order_payments add column if not exists status text;
alter table order_payments add column if not exists notes text;
alter table order_documents add column if not exists order_id uuid;
alter table order_documents add column if not exists storage_path text;
alter table order_documents add column if not exists file_name text;
alter table order_documents add column if not exists document_type_id uuid;
alter table order_documents add column if not exists status text;
alter table order_documents add column if not exists received_at date;
alter table order_documents add column if not exists notes text;
alter table documents add column if not exists storage_path text;

update orders set reference_name = name where reference_name is null;
alter table forwarder_quotes drop column if exists order_id;
alter table forwarder_quotes drop column if exists container_id;
alter table forwarder_quotes drop column if exists cargo_item_id;
alter table forwarder_quotes add column if not exists forwarder_id uuid;
alter table forwarder_quotes add column if not exists shipment_id uuid;
alter table forwarder_quotes add column if not exists amount numeric(12, 2);
alter table forwarder_quotes add column if not exists currency text;
alter table forwarder_quotes add column if not exists container_size text;
alter table forwarder_quotes add column if not exists free_time_days integer;
alter table forwarder_quotes add column if not exists route_option text;
alter table forwarder_quotes add column if not exists transit_days integer;
alter table forwarder_quotes add column if not exists valid_until date;
alter table forwarder_quotes add column if not exists notes text;
alter table forwarder_quotes add column if not exists is_selected boolean;
alter table forwarder_quotes add column if not exists created_at timestamp with time zone;
alter table forwarder_quotes add column if not exists updated_at timestamp with time zone;

update forwarder_quotes set currency = 'USD' where currency is null;
update forwarder_quotes set is_selected = false where is_selected is null;
update forwarder_quotes set created_at = now() where created_at is null;
update forwarder_quotes set updated_at = now() where updated_at is null;

create index if not exists forwarder_quotes_shipment_idx on forwarder_quotes (shipment_id);
create index if not exists forwarder_quotes_forwarder_idx on forwarder_quotes (forwarder_id);

insert into document_types (code, name, is_required, is_critical)
values
  ('BL', 'BL', true, true),
  ('CI', 'CI', true, false),
  ('PL', 'PL', true, false)
on conflict do nothing;

update document_types set applies_to = 'order' where code in ('CI', 'PL', 'BL', 'CO', 'NAVLUN_SIGORTA');
update document_types set applies_to = 'shipment' where code in ('CIKIS_IHBARI', 'VARIS_IHBARI');

insert into document_types (code, name, is_required, is_critical, applies_to)
values
  ('CO', 'CO', true, false, 'order'),
  ('NAVLUN_SIGORTA', 'Navlun Sigortasi', true, false, 'order'),
  ('CIKIS_IHBARI', 'Cikis Ihbari', true, false, 'shipment'),
  ('VARIS_IHBARI', 'Varis Ihbari', true, false, 'shipment')
on conflict (code) do nothing;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict do nothing;

update storage.buckets set public = true where id = 'documents';

alter table storage.objects enable row level security;

drop policy if exists "documents_public_select" on storage.objects;
create policy "documents_public_select" on storage.objects
  for select
  using (bucket_id = 'documents');

drop policy if exists "documents_public_insert" on storage.objects;
create policy "documents_public_insert" on storage.objects
  for insert
  with check (bucket_id = 'documents');

drop policy if exists "documents_public_update" on storage.objects;
create policy "documents_public_update" on storage.objects
  for update
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

drop policy if exists "documents_public_delete" on storage.objects;
create policy "documents_public_delete" on storage.objects
  for delete
  using (bucket_id = 'documents');

create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('Admin', 'Yonetim', 'Satis'))
);
