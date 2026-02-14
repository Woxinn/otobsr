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

create table if not exists product_sales_10y_totals (
  product_id uuid primary key references products(id) on delete cascade,
  total_10y numeric(18,2),
  updated_at timestamptz default now()
);

create trigger product_sales_10y_totals_set_updated_at
before update on product_sales_10y_totals
for each row execute procedure trigger_set_timestamp();

alter table product_sales_10y_totals disable row level security;
