-- order arşiv kolonu
alter table orders add column if not exists archived boolean not null default false;
alter table orders add column if not exists archived_at timestamptz;

create index if not exists idx_orders_archived on orders(archived);
create index if not exists idx_orders_archived_created on orders(archived, created_at);
