-- FEATURE: product-cost/country-priority
alter table products add column if not exists default_cost_country text;
create index if not exists products_default_cost_country_idx on products(default_cost_country);
-- END FEATURE: product-cost/country-priority
