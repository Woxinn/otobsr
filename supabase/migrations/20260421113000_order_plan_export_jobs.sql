create table if not exists order_plan_export_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users(id),
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  params jsonb not null default '{}'::jsonb,
  total_products int not null default 0,
  total_codes int not null default 0,
  processed_codes int not null default 0,
  error text
);

create index if not exists order_plan_export_jobs_created_at_idx
  on order_plan_export_jobs(created_at desc);

create table if not exists order_plan_export_job_rows (
  job_id uuid not null references order_plan_export_jobs(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  code text not null,
  name text not null,
  group_name text,
  netsis_code text,
  in_transit numeric(14,2) not null default 0,
  proforma_open numeric(14,2) not null default 0,
  rfq_qty numeric(14,2) not null default 0,
  sales10y numeric(14,2) not null default 0,
  lead int not null default 105,
  safety int not null default 15,
  plan_value numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (job_id, product_id)
);

create index if not exists order_plan_export_job_rows_job_id_idx
  on order_plan_export_job_rows(job_id);

create table if not exists order_plan_export_job_codes (
  job_id uuid not null references order_plan_export_jobs(id) on delete cascade,
  netsis_code text not null,
  stock numeric(14,2) not null default 0,
  sales120 numeric(14,2) not null default 0,
  sales60 numeric(14,2) not null default 0,
  sales_prev60 numeric(14,2) not null default 0,
  sales10y numeric(14,2) not null default 0,
  fetched boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (job_id, netsis_code)
);

create index if not exists order_plan_export_job_codes_job_id_fetched_idx
  on order_plan_export_job_codes(job_id, fetched);

alter table order_plan_export_jobs disable row level security;
alter table order_plan_export_job_rows disable row level security;
alter table order_plan_export_job_codes disable row level security;
