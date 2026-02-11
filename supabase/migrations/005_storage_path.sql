create extension if not exists "pgcrypto";

alter table documents add column if not exists storage_path text;
alter table order_documents add column if not exists storage_path text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'file_path'
  ) then
    execute 'update public.documents set storage_path = file_path where storage_path is null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_documents'
      and column_name = 'file_path'
  ) then
    execute 'update public.order_documents set storage_path = file_path where storage_path is null';
  end if;
end $$;
