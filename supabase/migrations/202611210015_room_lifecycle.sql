alter table public.rooms add column empty_since_ms bigint;
create index owned_private_rooms on public.rooms(owner_id) where is_private and owner_id is not null;
alter table public.room_members add column away_tag text check (away_tag in ('awayReels', 'awaySleep', 'awayBusy')),
  add column missed_check boolean not null default false;

create table public.room_connections (
  user_id uuid not null references public.room_members(user_id) on delete cascade,
  client_id text not null,
  generation bigint not null default 0,
  expires_ms bigint not null,
  away_tag text check (away_tag in ('awayReels', 'awaySleep', 'awayBusy')),
  primary key (user_id, client_id)
);
create index room_connections_expiry on public.room_connections(expires_ms);
create table public.study_invite_limits (
  sender uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  retry_ms bigint not null,
  primary key (sender, recipient)
);
alter table public.room_connections enable row level security;
alter table public.study_invite_limits enable row level security;
revoke all on public.room_connections, public.study_invite_limits from public, anon, authenticated;
insert into public.study_invite_limits (sender, recipient, retry_ms)
  select sender, recipient, floor(extract(epoch from expires_at - interval '29 minutes') * 1000)::bigint
  from public.study_invites where expires_at > clock_timestamp() + interval '29 minutes'
  on conflict (sender, recipient) do update set retry_ms = greatest(public.study_invite_limits.retry_ms, excluded.retry_ms);

create function public.library_time_ms()
returns bigint language sql set search_path = '' as $$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint
$$;
revoke all on function public.library_time_ms() from public, anon, authenticated;

create function public.room_member_activity(member public.room_members, observed bigint)
returns text language sql set search_path = '' as $$
  select case when member.missed_check or exists (
      select 1 from public.sessions where user_id = member.user_id and state = 'active'
        and next_check_at + 30000 <= observed
    ) then 'missedCheck'
    when member.away_tag is not null then member.away_tag
    when exists (select 1 from public.sessions where user_id = member.user_id and state = 'active'
      and paused_at is null and end_ms > observed) then 'working'
    else member.status end
$$;
revoke all on function public.room_member_activity(public.room_members, bigint) from public, anon, authenticated;

-- Existing room queries use seen + 15 seconds as the occupancy deadline. Aggregate the live
-- connections into that same deadline so counts, capacity and rewards use one seat per account.
create function public.sync_room_connections(actor uuid, observed bigint)
returns boolean language plpgsql set search_path = '' as $$
declare
  lease bigint;
  tag text;
begin
  select max(expires_ms), case when not bool_or(away_tag is null)
    then (array_agg(away_tag order by expires_ms desc, client_id))[1] end
  into lease, tag from public.room_connections where user_id = actor and expires_ms > observed;
  if lease is null then return false; end if;
  update public.room_members set seen = lease - 15000, away_tag = tag where user_id = actor;
  return true;
end;
$$;
revoke all on function public.sync_room_connections(uuid, bigint) from public, anon, authenticated;

create or replace function public.broadcast_focus_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  desk public.room_members;
  observed bigint := public.library_time_ms();
  missed boolean := false;
begin
  if tg_op = 'UPDATE' then
    if (new.state, new.paused_at) is not distinct from (old.state, old.paused_at) then return null; end if;
    missed := coalesce(old.state = 'active' and new.state = 'invalid' and old.next_check_at + 30000 <= observed, false);
  end if;
  select * into desk from public.room_members where user_id = new.user_id;
  if found then
    if desk.missed_check is distinct from missed then
      update public.room_members set missed_check = missed where user_id = new.user_id;
      return null;
    end if;
    perform public.send_desk_activity(desk.room, desk.desk_ref,
      case when new.state = 'active' and new.paused_at is not null and desk.away_tag is null then 'break'
        else public.room_member_activity(desk, observed) end);
  end if;
  return null;
end;
$$;

create function public.broadcast_presence_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.send_desk_activity(new.room, new.desk_ref, public.room_member_activity(new, public.library_time_ms()));
  return null;
end;
$$;
revoke all on function public.broadcast_presence_tag() from public, anon, authenticated;
create trigger broadcast_presence_tag after update of away_tag, missed_check on public.room_members
  for each row when ((old.away_tag, old.missed_check) is distinct from (new.away_tag, new.missed_check))
  execute function public.broadcast_presence_tag();

create function public.room_membership_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  observed bigint := public.library_time_ms();
begin
  if tg_op = 'UPDATE' and old.room = new.room then return null; end if;
  if tg_op <> 'INSERT' then
    update public.rooms r set empty_since_ms = least(observed, greatest(old.seen + 15000,
      coalesce((select max(m.seen) + 15000 from public.room_members m where m.room = r.id), 0)))
    where r.id = old.room and r.is_private and r.owner_id is not null and r.empty_since_ms is null
      and not exists (select 1 from public.room_members m where m.room = r.id and m.seen > observed - 15000);
    perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || old.room, true);
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' then delete from public.room_connections where user_id = new.user_id; end if;
    update public.rooms set empty_since_ms = null where id = new.room and empty_since_ms is not null;
    perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || new.room, true);
  end if;
  return null;
end;
$$;
revoke all on function public.room_membership_changed() from public, anon, authenticated;
create trigger room_membership_changed after insert or update of room or delete on public.room_members
  for each row execute function public.room_membership_changed();

create function public.exit_library_room(actor uuid, observed bigint)
returns void language plpgsql set search_path = '' as $$
declare
  location text;
begin
  select room into location from public.room_members where user_id = actor;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('room:' || location, 0));
  delete from public.room_members where user_id = actor;
  -- A fully earned or already overdue period is left for the existing settlement logic.
  update public.sessions set state = 'invalid' where user_id = actor and state = 'active'
    and (paused_at is not null or end_ms > observed) and (next_check_at is null or next_check_at + 30000 > observed);
end;
$$;
revoke all on function public.exit_library_room(uuid, bigint) from public, anon, authenticated;

create function public.mark_empty_private_rooms(observed bigint)
returns void language plpgsql set search_path = '' as $$
declare
  location text;
begin
  for location in select id from public.rooms r where r.is_private and r.owner_id is not null and r.empty_since_ms is null
    and not exists (select 1 from public.room_members m where m.room = r.id and m.seen > observed - 15000) limit 250
  loop
    if pg_try_advisory_xact_lock(hashtextextended('room:' || location, 0)) then
      update public.rooms r set empty_since_ms = coalesce(
        (select max(m.seen) + 15000 from public.room_members m where m.room = r.id), observed)
      where r.id = location and r.owner_id is not null and r.empty_since_ms is null
        and not exists (select 1 from public.room_members m where m.room = r.id and m.seen > observed - 15000);
    end if;
  end loop;
end;
$$;
revoke all on function public.mark_empty_private_rooms(bigint) from public, anon, authenticated;
-- Rooms that predate this policy start their first grace period at rollout.
update public.rooms r set empty_since_ms = public.library_time_ms() where r.is_private and r.owner_id is not null
  and not exists (select 1 from public.room_members m where m.room = r.id and m.seen > public.library_time_ms() - 15000);

create function public.close_idle_private_room(location text, observed bigint)
returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.rooms where id = location and owner_id is not null
    and empty_since_ms + 43200000 <= observed) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('room:' || location, 0));
  update public.rooms r set owner_id = null, empty_since_ms = null where r.id = location and r.owner_id is not null
    and r.empty_since_ms + 43200000 <= observed
    and not exists (select 1 from public.room_members m where m.room = r.id and m.seen > observed - 15000);
  if found then delete from public.study_invites where room = location; end if;
end;
$$;
revoke all on function public.close_idle_private_room(text, bigint) from public, anon, authenticated;

alter function public.settle_focus_sessions() rename to settle_due_focus_sessions;
revoke all on function public.settle_due_focus_sessions() from public, anon, authenticated, service_role;
create function public.settle_focus_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  observed bigint := public.library_time_ms();
  candidate record;
  settled integer;
begin
  settled := public.settle_due_focus_sessions();
  for candidate in select m.user_id, m.room from public.room_members m where m.seen <= observed - 15000
    and exists (select 1 from public.room_connections where user_id = m.user_id) limit 250
  loop
    if pg_try_advisory_xact_lock(hashtextextended('user:' || candidate.user_id::text, 0))
      and pg_try_advisory_xact_lock(hashtextextended('room:' || candidate.room, 0))
      and exists (select 1 from public.room_members where user_id = candidate.user_id and room = candidate.room
        and seen <= observed - 15000) then
      perform public.exit_library_room(candidate.user_id, observed);
    end if;
  end loop;
  perform public.mark_empty_private_rooms(observed);
  for candidate in select id from public.rooms where owner_id is not null and empty_since_ms + 43200000 <= observed limit 100
  loop
    if pg_try_advisory_xact_lock(hashtextextended('room:' || candidate.id, 0)) then
      perform public.close_idle_private_room(candidate.id, observed);
    end if;
  end loop;
  return settled;
end;
$$;
revoke all on function public.settle_focus_sessions() from public, anon, authenticated;
grant execute on function public.settle_focus_sessions() to service_role;

alter function public.library_action(uuid, text, jsonb) rename to library_profile_code_action;
revoke all on function public.library_profile_code_action(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  observed bigint;
  client text := payload->>'clientId';
  mode text := payload->>'mode';
  event_generation bigint := case when payload->>'generation' ~ '^[0-9]{1,12}$' then (payload->>'generation')::bigint else 0 end;
  membership public.room_members;
  focus public.sessions;
  destination text;
  invitee uuid;
  owned_room text;
  closed_on_leave boolean := false;
  snapshot jsonb;
  related_friends jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
  observed := public.library_time_ms();
  if client is not null and client !~ '^[0-9A-Za-z-]{8,80}$' then return jsonb_build_object('error', 'invalidConnection'); end if;
  select * into membership from public.room_members where user_id = actor;
  if action = 'roomPresence' then
    if client is null or mode is null or mode not in ('background','disconnect') then
      return jsonb_build_object('error', 'invalidConnection');
    end if;
    if membership.room is null or membership.room is distinct from payload->>'room' then return jsonb_build_object('ok', true); end if;
    perform pg_advisory_xact_lock(hashtextextended('room:' || membership.room, 0));
    if mode = 'disconnect' then
      delete from public.room_connections c where c.user_id = actor and c.client_id = client and c.generation <= event_generation;
      if found and not public.sync_room_connections(actor, observed) then perform public.exit_library_room(actor, observed); end if;
    elsif membership.seen > observed - 15000 then
      select * into focus from public.sessions where user_id = actor and state = 'active' and paused_at is null;
      insert into public.room_connections as c (user_id, client_id, generation, expires_ms, away_tag)
        values (actor, client, event_generation,
          greatest(observed + 90000, coalesce(focus.next_check_at + 30000, focus.end_ms) + 60000),
          (array['awayReels','awaySleep','awayBusy'])[1 + floor(random() * 3)::int])
      on conflict (user_id, client_id) do update set generation = excluded.generation, expires_ms = excluded.expires_ms,
        away_tag = excluded.away_tag where c.generation < excluded.generation
          or (c.generation = excluded.generation and c.away_tag is null);
      if found then perform public.sync_room_connections(actor, observed); end if;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if membership.seen <= observed - 15000 and exists (select 1 from public.room_connections where user_id = actor) then
    perform public.exit_library_room(actor, observed);
    membership := null;
  end if;
  if action in ('leave','inviteFriend') and exists (select 1 from public.sessions where user_id = actor
    and state = 'active' and paused_at is null and end_ms > observed and (next_check_at is null or next_check_at + 30000 > observed)) then
    return jsonb_build_object('error', 'working');
  end if;
  if action = 'createRoom' then
    for owned_room in select id from public.rooms where owner_id = actor and is_private loop
      perform public.close_idle_private_room(owned_room, observed);
    end loop;
    if exists (select 1 from public.rooms where owner_id = actor and is_private) then
      return jsonb_build_object('error', 'privateRoomOwned');
    end if;
  end if;
  case action
    when 'join' then destination := payload->>'room';
    when 'joinCode' then select room_id into destination from public.private_room_invites where code = payload->>'code';
    when 'answerStudyInvite' then
      if payload->>'answer' = 'accept' then
        select room into destination from public.study_invites where id::text = payload->>'id' and recipient = actor;
      end if;
    else null;
  end case;
  if membership.room is not null and (action in ('createRoom','joinCode') or destination is not null)
    and membership.room is distinct from destination then return jsonb_build_object('error', 'leaveRoomFirst'); end if;
  if destination is not null then perform public.close_idle_private_room(destination, observed); end if;

  if action = 'inviteFriend' and membership.room is not null then
    select case when reader_a = actor then reader_b else reader_a end into invitee from public.reader_friendships
    where id::text = payload->>'id' and actor in (reader_a, reader_b) and accepted;
    if invitee is not null then
      perform pg_advisory_xact_lock(hashtextextended('room:' || membership.room, 0));
      if exists (select 1 from public.room_members where user_id = invitee and room = membership.room and seen > observed - 15000) then
        return jsonb_build_object('error', 'friendInRoom');
      end if;
      if exists (select 1 from public.study_invite_limits where sender = actor and recipient = invitee and retry_ms > observed) then
        return jsonb_build_object('error', 'studyInviteCooldown');
      end if;
    end if;
  end if;
  if action = 'leave' and membership.room is not null then
    perform public.exit_library_room(actor, observed);
    select exists (select 1 from public.rooms where id = membership.room and owner_id = actor and empty_since_ms is not null)
    into closed_on_leave;
  elsif action = 'status' and payload->>'status' in ('desk','break') then
    update public.room_members set missed_check = false where user_id = actor;
  end if;
  snapshot := public.library_profile_code_action(actor, case when action = 'leave' then 'state' else action end, payload);
  if jsonb_typeof(snapshot->'profile') is distinct from 'object' then return snapshot; end if;

  select * into membership from public.room_members where user_id = actor;
  if membership.room is not null and (client is not null or exists (select 1 from public.room_connections where user_id = actor)) then
    delete from public.room_connections where user_id = actor and expires_ms <= observed;
    if coalesce(payload->>'foreground', 'true') = 'true' then
      insert into public.room_connections (user_id, client_id, generation, expires_ms)
      values (actor, coalesce(client, 'legacy'), event_generation, observed + 15000)
      on conflict (user_id, client_id) do update set generation = excluded.generation, expires_ms = excluded.expires_ms, away_tag = null
      where public.room_connections.generation <= excluded.generation;
    end if;
    perform public.sync_room_connections(actor, observed);
  end if;
  if action = 'inviteFriend' and invitee is not null then
    insert into public.study_invite_limits values (actor, invitee, public.library_time_ms() + 60000)
    on conflict (sender, recipient) do update set retry_ms = excluded.retry_ms;
  end if;
  select coalesce(jsonb_agg(entry || jsonb_build_object('inRoom', m.user_id is not null, 'inviteRetryAt', limits.retry_ms)
    order by position), '[]') into related_friends
  from jsonb_array_elements(snapshot->'friends') with ordinality as entries(entry, position)
  join public.reader_friendships f on f.id = (entry->>'id')::uuid
  left join public.room_members m on m.user_id = case when f.reader_a = actor then f.reader_b else f.reader_a end
    and m.room = membership.room and m.seen > observed - 15000
  left join public.study_invite_limits limits on limits.sender = actor and limits.recipient = case when f.reader_a = actor then f.reader_b else f.reader_a end;
  return snapshot || jsonb_build_object(
    'profile', (snapshot->'profile') || jsonb_build_object('ownsPrivateRoom', exists (select 1 from public.rooms where owner_id = actor and is_private)),
    'rooms', (select coalesce(jsonb_agg(entry || jsonb_build_object('owned', r.owner_id is not null and r.owner_id = actor) order by position), '[]')
      from jsonb_array_elements(snapshot->'rooms') with ordinality as entries(entry, position) join public.rooms r on r.id = entry->>'id'),
    'members', (select coalesce(jsonb_agg(entry || jsonb_build_object('activity', public.room_member_activity(m, observed)) order by position), '[]')
      from jsonb_array_elements(snapshot->'members') with ordinality as entries(entry, position)
      join public.room_members m on m.desk_ref = (entry->>'desk_ref')::uuid),
    'friends', related_friends,
    'studyInvites', (select coalesce(jsonb_agg(entry || jsonb_build_object('expiresAt', floor(extract(epoch from i.expires_at) * 1000)::bigint) order by position), '[]')
      from jsonb_array_elements(snapshot->'studyInvites') with ordinality as entries(entry, position)
      join public.study_invites i on i.id = (entry->>'id')::uuid where i.room is distinct from membership.room),
    'privateRoomClosing', closed_on_leave);
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
