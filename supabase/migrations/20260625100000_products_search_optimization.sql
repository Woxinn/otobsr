-- Enable pg_trgm extension for pattern matching support on LIKE/ILIKE wildcards
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN Trigram indexes for fast case-insensitive wildcard searches
CREATE INDEX IF NOT EXISTS products_code_trgm_idx ON products USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_brand_trgm_idx ON products USING gin (brand gin_trgm_ops);

-- Create B-Tree indexes on foreign keys to optimize product group counts, GTIP filters, and stock filters
CREATE INDEX IF NOT EXISTS products_group_id_idx ON products (group_id);
CREATE INDEX IF NOT EXISTS products_gtip_id_idx ON products (gtip_id);
CREATE INDEX IF NOT EXISTS products_netsis_stok_kodu_idx ON products (netsis_stok_kodu);
