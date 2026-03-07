create extension if not exists "pgcrypto";

alter table order_documents
  add column if not exists freight_amount numeric(12, 2),
  add column if not exists freight_currency text;

update order_documents
set freight_currency = coalesce(freight_currency, 'USD')
where freight_currency is null;
