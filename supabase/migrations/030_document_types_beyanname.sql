create extension if not exists "pgcrypto";

insert into document_types (code, name, is_required, is_critical, applies_to)
values ('BEYANNAME', 'Beyanname', true, false, 'order')
on conflict (code) do nothing;
