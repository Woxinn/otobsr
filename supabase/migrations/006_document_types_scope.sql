create extension if not exists "pgcrypto";

alter table document_types add column if not exists applies_to text;
update document_types set applies_to = 'shipment' where applies_to is null;

update document_types set applies_to = 'order' where code in ('CI', 'PL', 'BL', 'CO', 'NAVLUN_SIGORTA');
update document_types set applies_to = 'shipment' where code in ('CIKIS_IHBARI', 'VARIS_IHBARI');

insert into document_types (code, name, is_required, is_critical, applies_to)
values
  ('CO', 'CO', true, false, 'order'),
  ('NAVLUN_SIGORTA', 'Navlun Sigortasi', true, false, 'order'),
  ('CIKIS_IHBARI', 'Cikis Ihbari', true, false, 'shipment'),
  ('VARIS_IHBARI', 'Varis Ihbari', true, false, 'shipment')
on conflict (code) do nothing;
