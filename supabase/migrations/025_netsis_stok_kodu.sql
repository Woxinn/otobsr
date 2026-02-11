create extension if not exists "pgcrypto";

-- FEATURE: netsis-stok-kodu
alter table products add column if not exists netsis_stok_kodu text;
create index if not exists products_netsis_stok_kodu_idx on products (netsis_stok_kodu);
