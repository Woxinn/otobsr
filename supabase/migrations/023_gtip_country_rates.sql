-- FEATURE: product-cost/gtip-country
create table if not exists gtip_country_rates (
  id uuid primary key default gen_random_uuid(),
  gtip_id uuid not null references gtips(id) on delete cascade,
  country text not null,
  customs_duty_rate numeric(6,2) default 0,
  additional_duty_rate numeric(6,2) default 0,
  anti_dumping_applicable boolean default false,
  anti_dumping_rate numeric(12,4) default 0,
  surveillance_applicable boolean default false,
  surveillance_unit_value numeric(14,4) default 0,
  vat_rate numeric(6,2) default 0,
  created_at timestamptz default now(),
  unique (gtip_id, country)
);
create index if not exists gtip_country_rates_gtip_id_idx on gtip_country_rates(gtip_id);
-- END FEATURE: product-cost/gtip-country
