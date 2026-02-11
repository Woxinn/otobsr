create extension if not exists "pgcrypto";

-- alerts tablosuna order baglantisi
alter table if exists alerts
  add column if not exists order_id uuid references orders(id) on delete cascade;

create index if not exists idx_alerts_order on alerts (order_id);

-- siparis uretim takibi alanlari
alter table if exists orders
  add column if not exists production_status text,
  add column if not exists production_checked_at timestamptz,
  add column if not exists production_note text;
