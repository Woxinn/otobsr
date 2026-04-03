alter table if exists device_verifications
add column if not exists approved_at timestamptz;

alter table if exists device_verifications
add column if not exists approved_by uuid references auth.users(id) on delete set null;

create index if not exists device_verifications_approval_idx
on device_verifications(user_id, approved_at, used_at, expires_at);
