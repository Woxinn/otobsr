create table if not exists insurance_inbound_mails (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  subject text,
  from_email text,
  received_at timestamptz,
  has_policy_attachment boolean not null default false,
  policy_attachment_count integer not null default 0,
  raw_payload jsonb,
  imported_order_id uuid references orders(id) on delete set null,
  import_status text,
  import_note text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists insurance_inbound_attachments (
  id uuid primary key default gen_random_uuid(),
  mail_id uuid not null references insurance_inbound_mails(id) on delete cascade,
  provider_attachment_id text not null,
  filename text,
  content_type text,
  is_policy_candidate boolean not null default false,
  created_at timestamptz not null default now(),
  unique (mail_id, provider_attachment_id)
);

create index if not exists insurance_inbound_mails_received_idx
  on insurance_inbound_mails(received_at desc);

create index if not exists insurance_inbound_attachments_mail_idx
  on insurance_inbound_attachments(mail_id);
