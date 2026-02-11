create extension if not exists "pgcrypto";

alter table storage.objects enable row level security;

drop policy if exists "documents_public_select" on storage.objects;
create policy "documents_public_select" on storage.objects
  for select
  using (bucket_id = 'documents');

drop policy if exists "documents_public_insert" on storage.objects;
create policy "documents_public_insert" on storage.objects
  for insert
  with check (bucket_id = 'documents');

drop policy if exists "documents_public_update" on storage.objects;
create policy "documents_public_update" on storage.objects
  for update
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

drop policy if exists "documents_public_delete" on storage.objects;
create policy "documents_public_delete" on storage.objects
  for delete
  using (bucket_id = 'documents');
