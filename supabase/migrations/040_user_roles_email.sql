alter table public.user_roles
  add column if not exists email text;
