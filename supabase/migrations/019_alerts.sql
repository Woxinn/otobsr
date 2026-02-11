create extension if not exists "pgcrypto";

-- Uyarilar icin temel tablo
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references shipments(id) on delete cascade,
  event_type text not null,
  channel text not null default 'email',
  payload jsonb,
  status text not null default 'pending',
  error_text text,
  dedupe_key text unique,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_alerts_shipment on alerts (shipment_id);
create index if not exists idx_alerts_status on alerts (status);

alter table alerts disable row level security;

-- Kullanici/rol bazli kanal tercihleri icin basit tablo
create table if not exists user_alert_preferences (
  id uuid primary key default gen_random_uuid(),
  user_identifier text not null,
  event_type text not null,
  channel text not null default 'email',
  quiet_hours text, -- ornek: "22:00-07:00"
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_alert_preferences_user on user_alert_preferences (user_identifier);
create index if not exists idx_user_alert_preferences_event on user_alert_preferences (event_type);

alter table user_alert_preferences disable row level security;
