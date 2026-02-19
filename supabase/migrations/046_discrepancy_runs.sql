do $$
begin
  if not exists (select 1 from pg_proc where proname = 'trigger_set_timestamp') then
    create or replace function trigger_set_timestamp()
    returns trigger
    language plpgsql
    as $function$
    begin
      new.updated_at = now();
      return new;
    end;
    $function$;
  end if;
end;
$$;

create table if not exists discrepancy_runs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  supplier_name text,
  status text not null default 'acik',
  total_products integer not null default 0,
  equal_count integer not null default 0,
  shortage_count integer not null default 0,
  excess_count integer not null default 0,
  unexpected_count integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discrepancy_runs_status_check check (status in ('acik', 'kapatildi'))
);

create table if not exists discrepancy_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references discrepancy_runs(id) on delete cascade,
  product_code text not null,
  product_name text,
  order_qty numeric(14,2) not null default 0,
  packing_qty numeric(14,2) not null default 0,
  diff_qty numeric(14,2) not null default 0,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discrepancy_rows_status_check check (status in ('tam', 'eksik', 'fazla', 'beklenmeyen')),
  constraint discrepancy_rows_run_code_unique unique (run_id, product_code)
);

create table if not exists discrepancy_files (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references discrepancy_runs(id) on delete cascade,
  source_type text not null,
  file_name text,
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint discrepancy_files_source_type_check check (source_type in ('order', 'packing'))
);

create index if not exists discrepancy_rows_run_id_idx on discrepancy_rows(run_id);
create index if not exists discrepancy_rows_status_idx on discrepancy_rows(status);
create index if not exists discrepancy_runs_created_at_idx on discrepancy_runs(created_at desc);

drop trigger if exists discrepancy_runs_set_updated_at on discrepancy_runs;
create trigger discrepancy_runs_set_updated_at
before update on discrepancy_runs
for each row execute procedure trigger_set_timestamp();

drop trigger if exists discrepancy_rows_set_updated_at on discrepancy_rows;
create trigger discrepancy_rows_set_updated_at
before update on discrepancy_rows
for each row execute procedure trigger_set_timestamp();

alter table discrepancy_runs disable row level security;
alter table discrepancy_rows disable row level security;
alter table discrepancy_files disable row level security;
