create extension if not exists "pgcrypto";

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
  notes text,
  uploaded_at timestamp with time zone default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists order_payments_set_updated_at on order_payments;
create trigger order_payments_set_updated_at
before update on order_payments
for each row execute function set_updated_at();

alter table order_payments disable row level security;
alter table order_documents disable row level security;
