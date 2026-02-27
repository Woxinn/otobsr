-- add estimated cost for RFQ margin
alter table products add column if not exists estimated_cost numeric;
