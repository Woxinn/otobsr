-- Normalize existing rows then enforce case-insensitive check
update public.user_roles
set role = case lower(role)
  when 'admin' then 'Admin'
  when 'yonetim' then 'Yonetim'
  when 'satis' then 'Satis'
  else role end
where lower(role) in ('admin','yonetim','satis');

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check
  check (lower(role) in ('admin','yonetim','satis'));

