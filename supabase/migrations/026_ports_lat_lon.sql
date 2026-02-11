-- 026_ports_lat_lon
alter table ports add column if not exists lat numeric(10,6);
alter table ports add column if not exists lon numeric(10,6);
