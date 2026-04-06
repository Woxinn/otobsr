alter table if exists shipments
add column if not exists vessel_name text;

alter table if exists shipments
add column if not exists vessel_imo text;

alter table if exists shipments
add column if not exists vessel_flag text;
