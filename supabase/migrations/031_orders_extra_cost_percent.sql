alter table if exists public.orders
  add column if not exists extra_cost_percent numeric(8,3);
