insert into public.rooms (id, name, name_en) values
  ('mathematics', 'Matematik Odası', 'Mathematics Room'),
  ('history', 'Tarih Odası', 'History Room'),
  ('science', 'Bilim Odası', 'Science Room'),
  ('literature', 'Edebiyat Odası', 'Literature Room'),
  ('languages', 'Dil Odası', 'Language Room'),
  ('art', 'Sanat Odası', 'Art Room');

alter table public.profiles add column tour_pending boolean not null default false;
alter table public.profiles alter column tour_pending set default true;

alter function public.library_action(uuid, text, jsonb) rename to library_before_room_tour;
revoke all on function public.library_before_room_tour(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
begin
  snapshot := public.library_before_room_tour(actor, case when action = 'finishTour' then 'state' else action end, payload);
  if snapshot->>'profile' is null then return snapshot; end if;
  if action = 'finishTour' then update public.profiles set tour_pending = false where id = actor; end if;
  return jsonb_set(snapshot, '{profile,tourPending}',
    to_jsonb(coalesce((select tour_pending from public.profiles where id = actor), false)));
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;

create table public.account_deletion_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  id uuid not null default gen_random_uuid(),
  requested_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  otp_sent_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 5)
);
alter table public.account_deletion_challenges enable row level security;
revoke all on public.account_deletion_challenges from public, anon, authenticated;
grant select, update, delete on public.account_deletion_challenges to service_role;

create function public.reserve_account_deletion(actor uuid, session uuid)
returns uuid language sql security definer set search_path = '' as $$
  insert into public.account_deletion_challenges as challenge (user_id, session_id)
  values (actor, session)
  on conflict (user_id) do update set
    session_id = excluded.session_id, id = excluded.id, requested_at = excluded.requested_at,
    expires_at = null, otp_sent_at = null, attempts = 0
    where challenge.requested_at <= excluded.requested_at - interval '60 seconds'
  returning id
$$;

-- Bind the challenge to the exact Supabase Auth delivery. GoTrue records the
-- send time on auth.users and preserves it when verifyOtp consumes the code.
create function public.activate_account_deletion(actor uuid, session uuid, challenge uuid)
returns bigint language sql security definer set search_path = '' as $$
  update public.account_deletion_challenges as deletion set
    otp_sent_at = auth_user.recovery_sent_at,
    expires_at = auth_user.recovery_sent_at + interval '120 seconds'
  from auth.users as auth_user
  where deletion.user_id = actor and deletion.session_id = session and deletion.id = challenge
    and auth_user.id = actor and auth_user.recovery_sent_at >= deletion.requested_at - interval '2 seconds'
    and auth_user.recovery_sent_at + interval '120 seconds' > clock_timestamp()
    and auth_user.recovery_token <> ''
  returning (extract(epoch from deletion.expires_at) * 1000)::bigint
$$;

create function public.attempt_account_deletion(actor uuid, session uuid, challenge uuid)
returns boolean language sql security definer set search_path = '' as $$
  with admitted as (
    update public.account_deletion_challenges as deletion set attempts = attempts + 1
    from auth.users as auth_user
    where deletion.user_id = actor and deletion.session_id = session and deletion.id = challenge
      and deletion.expires_at > clock_timestamp() and deletion.attempts < 5
      and auth_user.id = actor and auth_user.recovery_sent_at = deletion.otp_sent_at and auth_user.recovery_token <> ''
    returning deletion.id
  )
  select exists (select 1 from admitted)
$$;

create function public.consume_account_deletion(actor uuid, session uuid, challenge uuid)
returns boolean language sql security definer set search_path = '' as $$
  with consumed as (
    delete from public.account_deletion_challenges as deletion using auth.users as auth_user
    where deletion.user_id = actor and deletion.session_id = session and deletion.id = challenge
      and deletion.expires_at > clock_timestamp() and deletion.attempts > 0
      and auth_user.id = actor and auth_user.recovery_sent_at = deletion.otp_sent_at and auth_user.recovery_token = ''
    returning deletion.id
  )
  select exists (select 1 from consumed)
$$;

revoke all on function public.reserve_account_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.activate_account_deletion(uuid, uuid, uuid), public.attempt_account_deletion(uuid, uuid, uuid),
  public.consume_account_deletion(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_account_deletion(uuid, uuid) to service_role;
grant execute on function public.activate_account_deletion(uuid, uuid, uuid), public.attempt_account_deletion(uuid, uuid, uuid),
  public.consume_account_deletion(uuid, uuid, uuid) to service_role;
