-- FEATURE: packing-list/import
create extension if not exists "pgcrypto";

create table if not exists packing_lists (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  file_name text,
  version smallint default 1,
  status text default 'draft',
  created_at timestamptz default now()
);
comment on table packing_lists is 'FEATURE: packing-list/import';

create table if not exists packing_list_boxes (
  id uuid primary key default gen_random_uuid(),
  packing_list_id uuid not null references packing_lists(id) on delete cascade,
  box_no text,
  gross_weight numeric(14,4),
  net_weight numeric(14,4),
  created_at timestamptz default now()
);

create table if not exists packing_list_lines (
  id uuid primary key default gen_random_uuid(),
  packing_list_id uuid not null references packing_lists(id) on delete cascade,
  box_id uuid references packing_list_boxes(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  product_name_raw text,
  line_no text,
  quantity numeric(14,4),
  net_weight numeric(14,4),
  gross_weight numeric(14,4),
  packages_count numeric(14,4),
  created_at timestamptz default now()
);

create index if not exists packing_lists_order_idx on packing_lists(order_id);
create index if not exists packing_list_lines_product_idx on packing_list_lines(product_id);
create index if not exists packing_list_lines_box_idx on packing_list_lines(box_id);
-- END FEATURE: packing-list/import
