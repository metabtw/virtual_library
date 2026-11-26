alter table public.rooms add column expires_ms bigint;
-- Existing rooms receive a full day from rollout because they have no creation timestamp.
update public.rooms set expires_ms = public.library_time_ms() + 86400000, empty_since_ms = null
where owner_id is not null;
create index owned_rooms_by_expiration on public.rooms(expires_ms) where owner_id is not null;

create function public.set_private_room_deadline()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.expires_ms := public.library_time_ms() + 86400000;
  return new;
end;
$$;
revoke all on function public.set_private_room_deadline() from public, anon, authenticated, service_role;
create trigger set_private_room_deadline before insert on public.rooms
  for each row when (new.owner_id is not null) execute function public.set_private_room_deadline();

create or replace function public.room_membership_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  observed bigint := public.library_time_ms();
begin
  if tg_op = 'UPDATE' and old.room = new.room then
    if old.seen <= observed - 15000 and new.seen > observed - 15000 then
      perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || new.room, true);
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then
    perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || old.room, true);
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' then delete from public.room_connections where user_id = new.user_id; end if;
    perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || new.room, true);
  end if;
  return null;
end;
$$;

create function public.close_due_private_room(location text, observed bigint)
returns boolean language plpgsql set search_path = '' as $$
declare
  deadline bigint;
begin
  select r.expires_ms into deadline from public.rooms r
    where r.id = location and r.owner_id is not null and r.expires_ms <= observed;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('room:' || location, 0));
  update public.rooms set owner_id = null where id = location and owner_id is not null;
  if not found then return false; end if;
  delete from public.study_invites where room = location;
  -- Leave periods that had already earned their full time for normal settlement.
  update public.sessions set state = 'invalid'
    where room_id = location and state = 'active'
      and (end_ms > deadline or paused_at is not null or next_check_at is not null);
  return true;
end;
$$;
revoke all on function public.close_due_private_room(text, bigint) from public, anon, authenticated, service_role;

-- The earlier library action calls this when opening or joining a room.
create or replace function public.close_idle_private_room(location text, observed bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.close_due_private_room(location, observed);
end;
$$;

create or replace function public.settle_rooms_before_prizes()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  observed bigint := public.library_time_ms();
  candidate record;
  settled integer;
begin
  for candidate in select id from public.rooms
    where owner_id is not null and expires_ms <= observed order by expires_ms, id limit 100
  loop
    if pg_try_advisory_xact_lock(hashtextextended('room:' || candidate.id, 0)) then
      perform public.close_due_private_room(candidate.id, observed);
    end if;
  end loop;
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
  return settled;
end;
$$;

drop policy list_rooms on public.rooms;
create policy list_rooms on public.rooms for select to authenticated using (
  (expires_ms is null or (expires_ms > (extract(epoch from statement_timestamp()) * 1000)::bigint and owner_id is not null))
  and (not is_private or (owner_id is not null and exists (
    select 1 from public.private_room_access where room_id = rooms.id and user_id = (select auth.uid())
  )))
);

alter function public.library_action(uuid,text,jsonb) rename to library_before_room_deadlines;
revoke all on function public.library_before_room_deadlines(uuid,text,jsonb) from public, anon, authenticated, service_role;
create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  observed bigint := public.library_time_ms();
  current_room text;
  destination text;
  candidate record;
  deadline bigint;
  requested_minutes bigint;
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
  select room into current_room from public.room_members where user_id = actor;
  case action
    when 'join', 'roomVisibility' then destination := payload->>'room';
    when 'joinCode' then
      select i.room_id into destination from public.private_room_invites i where i.code = payload->>'code';
    when 'answerStudyInvite' then
      if payload->>'answer' = 'accept' then
        select i.room into destination from public.study_invites i
          where i.id::text = payload->>'id' and i.recipient = actor;
      end if;
    else null;
  end case;

  for candidate in select r.id, r.expires_ms from public.rooms r
    where r.expires_ms is not null and r.owner_id is not null
      and (r.id = current_room or r.id = destination or (r.owner_id = actor and r.expires_ms <= observed))
    order by r.id
  loop
    perform pg_advisory_xact_lock(hashtextextended('room:' || candidate.id, 0));
    observed := public.library_time_ms();
    if candidate.expires_ms <= observed then
      perform public.close_due_private_room(candidate.id, observed);
    elsif candidate.id = current_room then
      deadline := candidate.expires_ms;
    end if;
  end loop;

  if deadline is not null then
    observed := public.library_time_ms();
    if action = 'start' then
      requested_minutes := case when jsonb_typeof(payload->'duration') = 'number' and payload->>'duration' ~ '^[0-9]{1,3}$'
        then (payload->>'duration')::bigint end;
      if requested_minutes between 5 and 180 and observed + requested_minutes * 60000 > deadline
        then return '{"error":"privateRoomCutoff"}'; end if;
    elsif action = 'status' and payload->>'status' = 'desk'
      and exists(select 1 from public.sessions s where s.user_id = actor and s.state = 'active'
        and s.paused_at is not null and observed + (s.end_ms - s.paused_at) > deadline)
    then return '{"error":"privateRoomCutoff"}'; end if;
  end if;

  result := public.library_before_room_deadlines(actor, action, payload);
  if jsonb_typeof(result->'profile') is distinct from 'object' then return result; end if;
  observed := (result->>'now')::bigint;
  return result || jsonb_build_object('rooms', (
    select coalesce(jsonb_agg(case when r.expires_ms is null then item
      else item || jsonb_build_object('expiresAt',r.expires_ms) end order by position), '[]')
    from jsonb_array_elements(result->'rooms') with ordinality rows(item, position)
    join public.rooms r on r.id = item->>'id'
    where r.expires_ms is null or (r.owner_id is not null and r.expires_ms > observed)
  ));
end;
$$;
revoke all on function public.library_action(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.library_action(uuid,text,jsonb) to service_role;
