create extension if not exists "pgcrypto";

alter table order_documents
  add column if not exists insurance_amount numeric(12, 2),
  add column if not exists insurance_currency text;

update order_documents
set insurance_currency = coalesce(insurance_currency, 'USD')
where insurance_currency is null;

