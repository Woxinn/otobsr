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

create table if not exists order_plan_entries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  value numeric(14,2),
  need_qty numeric(14,2),
  suggest_qty numeric(14,2),
  computed_at timestamptz default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz default now()
);

create unique index if not exists order_plan_entries_product_id_idx on order_plan_entries(product_id);

create trigger order_plan_entries_set_updated_at
before update on order_plan_entries
for each row execute procedure trigger_set_timestamp();

alter table order_plan_entries disable row level security;
