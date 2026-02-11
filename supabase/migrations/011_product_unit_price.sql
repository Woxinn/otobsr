create extension if not exists "pgcrypto";

alter table products
  add column if not exists unit_price numeric(12, 2);
