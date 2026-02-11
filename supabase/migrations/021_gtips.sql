-- FEATURE: product-cost/gtip
create extension if not exists "pgcrypto";

create table if not exists gtips (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  customs_duty_rate numeric(6,2) default 0,
  additional_duty_rate numeric(6,2) default 0,
  anti_dumping_applicable boolean default false,
  anti_dumping_rate numeric(12,4) default 0,
  surveillance_applicable boolean default false,
  surveillance_unit_value numeric(14,4) default 0,
  vat_rate numeric(6,2) default 0,
  created_at timestamptz default now()
);

comment on table gtips is 'FEATURE: product-cost/gtip';

alter table products
  add column if not exists gtip_id uuid references gtips(id) on delete set null,
  add column if not exists domestic_cost_percent numeric(6,2) default 0;

create index if not exists products_gtip_id_idx on products(gtip_id);
-- END FEATURE: product-cost/gtip
