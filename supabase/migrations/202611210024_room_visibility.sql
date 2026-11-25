create index created_rooms_by_owner on public.rooms(owner_id) where owner_id is not null;

create or replace function public.close_owned_room()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('room:' || new.id, 0));
  delete from public.room_members where room = new.id;
  delete from public.private_room_invites where room_id = new.id;
  delete from public.private_room_access where room_id = new.id;
  update public.rooms set name = 'Kapalı özel oda', name_en = 'Closed private room', is_private = true
    where id = new.id;
  return null;
end;
$$;

alter function public.library_action(uuid,text,jsonb) rename to library_before_visibility;
revoke all on function public.library_before_visibility(uuid,text,jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  destination text;
  result jsonb;
  room_record public.rooms;
  make_public boolean;
  observed bigint;
  has_room boolean;
begin
  if action = 'target' then return '{"error":"targetRemoved"}'; end if;

  if action in ('createRoom','roomVisibility','join','joinCode','answerStudyInvite') then
    perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
    if action = 'createRoom' then
      if exists(select 1 from public.rooms where owner_id=actor and not is_private)
        then return '{"error":"privateRoomOwned"}'; end if;
    elsif action = 'roomVisibility' then
      destination := payload->>'room';
      if destination is null or jsonb_typeof(payload->'public') is distinct from 'boolean'
        then return '{"error":"roomVisibilityInvalid"}'; end if;
      perform pg_advisory_xact_lock(hashtextextended('room:' || destination, 0));
      select * into room_record from public.rooms where id=destination and owner_id=actor;
      if not found then return '{"error":"roomOwnerRequired"}'; end if;
      observed := public.library_time_ms();
      if not exists(select 1 from public.room_members m where m.room=destination and m.user_id=actor and m.seen>observed-15000)
        then return '{"error":"roomMissing"}'; end if;
      if exists(select 1 from public.sessions s where s.user_id=actor and s.state='active' and s.paused_at is null)
        then return '{"error":"working"}'; end if;
      make_public := (payload->>'public')::boolean;
      if room_record.is_private = make_public then
        if not make_public then
          insert into public.private_room_access(room_id,user_id)
            select destination,m.user_id from public.room_members m where m.room=destination and m.seen>observed-15000
            on conflict do nothing;
        end if;
        update public.rooms set is_private=not make_public, empty_since_ms=null where id=destination;
        perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || destination, true);
      end if;
      action := 'state';
    else
      case action
        when 'join' then destination := payload->>'room';
        when 'joinCode' then
          select room_id into destination from public.private_room_invites where code=payload->>'code';
        when 'answerStudyInvite' then
          if payload->>'answer' = 'accept' then
            select i.room into destination from public.study_invites i
              where i.id::text=payload->>'id' and i.recipient=actor;
          end if;
      end case;
      if destination is not null then
        perform pg_advisory_xact_lock(hashtextextended('room:' || destination, 0));
      end if;
    end if;
  end if;

  result := public.library_before_visibility(actor, action, payload);
  if jsonb_typeof(result->'profile') is distinct from 'object' then return result; end if;
  if action = 'start' and coalesce(payload->>'planId','') = '' then
    update public.sessions set study_topic=null where user_id=actor and state='active';
  end if;
  select exists(select 1 from public.rooms where owner_id=actor) into has_room;
  return result || jsonb_build_object(
    'profile', ((result->'profile') - 'target') || jsonb_build_object('ownsPrivateRoom',has_room),
    'rooms', (select coalesce(jsonb_agg(item - 'targets' order by position),'[]')
      from jsonb_array_elements(result->'rooms') with ordinality rows(item,position)),
    'members', (select coalesce(jsonb_agg(item - 'target' order by position),'[]')
      from jsonb_array_elements(result->'members') with ordinality rows(item,position))
  );
end;
$$;
revoke all on function public.library_action(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.library_action(uuid,text,jsonb) to service_role;
