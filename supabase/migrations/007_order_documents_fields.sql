create extension if not exists "pgcrypto";

alter table order_documents add column if not exists document_type_id uuid references document_types(id);
alter table order_documents add column if not exists status text;
alter table order_documents add column if not exists received_at date;

update order_documents set status = 'Geldi' where status is null;
