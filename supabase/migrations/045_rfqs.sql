do $$
begin
  if not exists (select 1 from pg_proc where proname = 'trigger_set_timestamp') then
    create or replace function trigger_set_timestamp()
    returns trigger
    language plpgsql
    as $function$
    begin
      new.updated_at = now();
      return new;
    end;
    $function$;
  end if;
end;
$$;

create type rfq_status as enum ('draft','sent','waiting','answered','closed');

create table if not exists rfqs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text,
  notes text,
  status rfq_status not null default 'draft',
  target_suppliers jsonb,
  currency text,
  incoterm text,
  response_due_date date,
  notify_sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists rfq_items (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  plan_entry_id uuid references order_plan_entries(id) on delete set null,
  product_code text,
  product_name text,
  quantity numeric(14,2) not null default 0,
  unit text,
  target_delivery_date date,
  created_at timestamptz default now()
);

create table if not exists rfq_suppliers (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  invite_status text default 'pending',
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists rfq_quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  quote_no text,
  total_amount numeric(18,2),
  currency text,
  validity_date date,
  transit_time text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists rfq_quote_items (
  id uuid primary key default gen_random_uuid(),
  rfq_quote_id uuid not null references rfq_quotes(id) on delete cascade,
  rfq_item_id uuid references rfq_items(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  unit_price numeric(18,4),
  min_order numeric(14,2),
  delivery_time text,
  terms text,
  notes text
);

create index if not exists rfq_items_rfq_id_idx on rfq_items(rfq_id);
create index if not exists rfq_items_product_id_idx on rfq_items(product_id);
create index if not exists rfq_suppliers_rfq_id_idx on rfq_suppliers(rfq_id);
create index if not exists rfq_quotes_rfq_id_idx on rfq_quotes(rfq_id);
create index if not exists rfq_quote_items_quote_id_idx on rfq_quote_items(rfq_quote_id);

create trigger rfqs_set_updated_at
before update on rfqs
for each row execute procedure trigger_set_timestamp();

alter table rfqs disable row level security;
alter table rfq_items disable row level security;
alter table rfq_suppliers disable row level security;
alter table rfq_quotes disable row level security;
alter table rfq_quote_items disable row level security;
