create extension if not exists "pgcrypto";

delete from document_types
where code in ('INS', 'INSURANCE')
   or lower(name) in ('insurance', 'sigorta');
