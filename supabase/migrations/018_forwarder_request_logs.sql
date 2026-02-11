create extension if not exists "pgcrypto";

create table if not exists forwarder_request_logs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  forwarder_id uuid not null references forwarders(id),
  subject text,
  body text,
  status text default 'queued',
  error_text text,
  sent_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_forwarder_request_logs_shipment on forwarder_request_logs (shipment_id);
