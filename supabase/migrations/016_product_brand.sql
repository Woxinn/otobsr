create extension if not exists "pgcrypto";

alter table products
  add column if not exists brand text;
