-- Public, non-personal room illustrations. Uploads are managed by project operators.
insert into storage.buckets (id, name, public)
values ('room-art', 'room-art', true);

-- Only the authenticated Edge Function's service client can register and read tokens.
create table public.push_devices (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  locale text not null default 'tr' check (locale in ('tr','en'))
);
create index push_devices_user on public.push_devices(user_id);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
grant select, insert, update, delete on public.push_devices to service_role;
