create table if not exists trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  device_label text not null,
  user_agent text,
  browser text,
  platform text,
  last_ip text,
  approved_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_token_hash)
);

create index if not exists trusted_devices_user_id_idx on trusted_devices(user_id);
create index if not exists trusted_devices_active_idx on trusted_devices(user_id, revoked_at);

create table if not exists device_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  device_label text not null,
  user_agent text,
  browser text,
  platform text,
  requested_ip text,
  return_to text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists device_verifications_user_id_idx on device_verifications(user_id);
create index if not exists device_verifications_lookup_idx on device_verifications(user_id, device_token_hash, used_at);

alter table trusted_devices enable row level security;
alter table device_verifications enable row level security;

drop policy if exists "trusted_devices_select_own" on trusted_devices;
create policy "trusted_devices_select_own"
on trusted_devices
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "trusted_devices_insert_own" on trusted_devices;
create policy "trusted_devices_insert_own"
on trusted_devices
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "trusted_devices_update_own" on trusted_devices;
create policy "trusted_devices_update_own"
on trusted_devices
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "trusted_devices_delete_own" on trusted_devices;
create policy "trusted_devices_delete_own"
on trusted_devices
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "device_verifications_select_own" on device_verifications;
create policy "device_verifications_select_own"
on device_verifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "device_verifications_insert_own" on device_verifications;
create policy "device_verifications_insert_own"
on device_verifications
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "device_verifications_update_own" on device_verifications;
create policy "device_verifications_update_own"
on device_verifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "device_verifications_delete_own" on device_verifications;
create policy "device_verifications_delete_own"
on device_verifications
for delete
to authenticated
using (auth.uid() = user_id);
