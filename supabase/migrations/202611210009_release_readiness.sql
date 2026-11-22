create or replace function public.close_owned_room()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('room:' || new.id, 0));
  delete from public.room_members where room = new.id;
  delete from public.private_room_invites where room_id = new.id;
  delete from public.private_room_access where room_id = new.id;
  update public.rooms set name = 'Kapalı özel oda', name_en = 'Closed private room'
    where id = new.id and is_private;
  return new;
end;
$$;

update public.rooms set name = 'Kapalı özel oda', name_en = 'Closed private room'
  where is_private and owner_id is null
    and (name, name_en) is distinct from ('Kapalı özel oda', 'Closed private room');

alter table public.reward_delivery
  add column expo_ticket_id text,
  add column receipt_attempts integer not null default 0 check (receipt_attempts >= 0);

create or replace function public.claim_focus_rewards()
returns table (id uuid, token text, amount integer, attempts integer, locale text, user_id uuid)
language sql security definer set search_path = '' as $$
  with ready as (
    select q.id from public.reward_delivery q
    where q.expo_ticket_id is null and q.next_attempt <= clock_timestamp()
    order by q.next_attempt, q.id limit 50
    for update skip locked
  ), leased as (
    update public.reward_delivery q
    set attempts = q.attempts + 1, next_attempt = clock_timestamp() + interval '2 minutes'
    from ready where q.id = ready.id returning q.*
  )
  select l.id, l.token, l.amount, l.attempts,
    case when d.user_id = s.user_id then d.locale end, s.user_id
  from leased l join public.sessions s on s.id = l.session_id
  left join public.push_devices d on d.token = l.token
$$;

create function public.claim_focus_receipts()
returns table (id uuid, token text, attempts integer, receipt_attempts integer,
  expo_ticket_id text, locale text, user_id uuid)
language sql security definer set search_path = '' as $$
  with ready as (
    select q.id from public.reward_delivery q
    where q.expo_ticket_id is not null and q.next_attempt <= clock_timestamp()
    order by q.next_attempt, q.id limit 50
    for update skip locked
  ), leased as (
    update public.reward_delivery q
    set receipt_attempts = q.receipt_attempts + 1, next_attempt = clock_timestamp() + interval '2 minutes'
    from ready where q.id = ready.id returning q.*
  )
  select l.id, l.token, l.attempts, l.receipt_attempts, l.expo_ticket_id,
    case when d.user_id = s.user_id then d.locale end, s.user_id
  from leased l join public.sessions s on s.id = l.session_id
  left join public.push_devices d on d.token = l.token
$$;
revoke all on function public.claim_focus_receipts() from public, anon, authenticated;
grant execute on function public.claim_focus_receipts() to service_role;
