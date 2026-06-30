create table if not exists product_group_notes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references product_groups(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table product_group_notes disable row level security;

create index if not exists product_group_notes_group_id_idx on product_group_notes (group_id);

drop trigger if exists product_group_notes_set_updated_at on product_group_notes;
create trigger product_group_notes_set_updated_at
before update on product_group_notes
for each row execute function set_updated_at();

insert into product_group_notes (group_id, content, created_at, updated_at)
select id, notes, created_at, updated_at from product_groups
where notes is not null and trim(notes) <> ''
on conflict do nothing;

update product_groups set notes = null where notes is not null;
