create table if not exists proformas (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  proforma_no text not null,
  proforma_date date,
  currency text not null default 'USD',
  status text not null default 'taslak',
  notes text,
  total_amount numeric(18,4) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proformas_status_check check (status in ('taslak', 'onayli', 'iptal'))
);

create unique index if not exists proformas_supplier_no_idx on proformas(supplier_id, proforma_no);
create index if not exists proformas_supplier_idx on proformas(supplier_id);
create index if not exists proformas_date_idx on proformas(proforma_date desc);

create table if not exists proforma_items (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references proformas(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_code text not null,
  product_name text,
  quantity numeric(18,4) not null default 0,
  unit_price numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proforma_items_proforma_idx on proforma_items(proforma_id);
create index if not exists proforma_items_product_idx on proforma_items(product_id);
create index if not exists proforma_items_code_idx on proforma_items(product_code);

drop trigger if exists proformas_set_updated_at on proformas;
create trigger proformas_set_updated_at
before update on proformas
for each row execute procedure trigger_set_timestamp();

drop trigger if exists proforma_items_set_updated_at on proforma_items;
create trigger proforma_items_set_updated_at
before update on proforma_items
for each row execute procedure trigger_set_timestamp();

alter table proformas disable row level security;
alter table proforma_items disable row level security;
