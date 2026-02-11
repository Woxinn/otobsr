-- FEATURE: product-type-compliance
create table if not exists product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists product_type_compliance (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid references product_types(id) on delete cascade,
  country text, -- iso alpha2/alpha3 veya serbest metin; null ise tum ulkeler
  tse_status text,
  analiz_gecerlilik date,
  tareks_no text,
  rapor_no text,
  valid_from date,
  valid_to date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_product_type_compliance_type on product_type_compliance(product_type_id);
create index if not exists idx_product_type_compliance_country on product_type_compliance(country);

alter table products
  add column if not exists product_type_id uuid references product_types(id);

