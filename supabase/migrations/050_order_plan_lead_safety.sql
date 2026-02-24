-- Lead/Safety güncelleme: kategori bazlı ve global varsayılanlar

-- Global defaults table (tek satır)
create table if not exists public.order_plan_defaults (
  id integer primary key default 1,
  lead_time_days integer not null default 105,
  safety_days integer not null default 15,
  updated_at timestamptz not null default now()
);

insert into public.order_plan_defaults (id) values (1)
on conflict (id) do nothing;

-- Kategori (product_groups) bazlı override kolonları
alter table public.product_groups
  add column if not exists lead_time_days integer,
  add column if not exists safety_days integer;

comment on column public.product_groups.lead_time_days is 'Sipariş planı için kategoriye özel lead time (gün)';
comment on column public.product_groups.safety_days is 'Sipariş planı için kategoriye özel safety time (gün)';

