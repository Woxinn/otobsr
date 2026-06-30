create table if not exists product_notes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table product_notes disable row level security;

create index if not exists product_notes_product_id_idx on product_notes (product_id);

drop trigger if exists product_notes_set_updated_at on product_notes;
create trigger product_notes_set_updated_at
before update on product_notes
for each row execute function set_updated_at();
