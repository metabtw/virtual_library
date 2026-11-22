create function public.grant_study_coins(recipient uuid, event text, reward integer)
returns boolean language plpgsql set search_path = '' as $$
begin
  insert into public.coin_ledger values (event, recipient, reward) on conflict (reference) do nothing;
  if not found then return false; end if;
  update public.profiles p set coins = p.coins + reward where p.id = recipient;
  return true;
end;
$$;
revoke all on function public.grant_study_coins(uuid, text, integer) from public, anon, authenticated;

create or replace function public.credit_study_club()
returns trigger language plpgsql set search_path = '' as $$
declare
  credited integer := (new.end_ms - new.start_ms) / 60000;
  total bigint;
  observed bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if new.state = 'completed' and new.room_id is not null then
    insert into public.room_progress (room_id, minutes) values (new.room_id, credited)
    on conflict (room_id) do update set minutes = public.room_progress.minutes + excluded.minutes
    returning minutes into total;
    insert into public.room_chests (room_id, milestone, user_id)
      select m.room, milestone, m.user_id from public.room_members m
      cross join generate_series((total - credited) / 100 + 1, total / 100) milestone
      where m.room = new.room_id and m.seen > observed - 15000
      on conflict do nothing;
  end if;

  if (new.state = 'invalid' or (new.state = 'completed' and credited >= 50))
    and exists (select 1 from public.user_items where user_id = new.user_id and item = 'cat') then
    insert into public.pets (user_id, xp, upset)
    values (new.user_id, case when new.state = 'completed' then credited / 50 else 0 end, new.state = 'invalid')
    on conflict (user_id) do update set xp = public.pets.xp + excluded.xp, upset = excluded.upset;
  end if;
  return new;
end;
$$;

create function public.daily_focus_quests(actor uuid, today date)
returns jsonb language plpgsql set search_path = '' as $$
declare
  minutes integer;
  goal record;
  goals jsonb := '[]';
  event_id text;
begin
  select coalesce(sum((s.end_ms - s.start_ms) / 60000), 0)::int into minutes
  from public.sessions s
  where s.user_id = actor and s.state = 'completed'
    and s.end_ms >= extract(epoch from (today::timestamp at time zone 'Europe/Istanbul')) * 1000
    and s.end_ms < extract(epoch from ((today + 1)::timestamp at time zone 'Europe/Istanbul')) * 1000;

  for goal in select * from (values (30, 5), (60, 10)) as targets(minutes, coins)
  loop
    if minutes >= goal.minutes then
      event_id := format('daily:%s:%s:%s', actor, today, goal.minutes);
      if not exists (select 1 from public.coin_ledger where reference = event_id) then
        perform public.grant_study_coins(actor, event_id, goal.coins);
      end if;
    end if;
    goals := goals || jsonb_build_array(jsonb_build_object('minutes', goal.minutes, 'coins', goal.coins,
      'completed', minutes >= goal.minutes));
  end loop;
  return jsonb_build_object('date', today, 'minutes', minutes, 'goals', goals);
end;
$$;
revoke all on function public.daily_focus_quests(uuid, date) from public, anon, authenticated;

create function public.credit_daily_focus()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.daily_focus_quests(new.user_id, (to_timestamp(new.end_ms / 1000.0) at time zone 'Europe/Istanbul')::date);
  return new;
end;
$$;
revoke all on function public.credit_daily_focus() from public, anon, authenticated;
create trigger reward_daily_focus after update of state on public.sessions
  for each row when (old.state = 'active' and new.state = 'completed')
  execute function public.credit_daily_focus();

create function public.send_desk_activity(room text, desk uuid, activity text)
returns void language sql set search_path = '' as $$
  select realtime.send(jsonb_build_object('desk', desk, 'status', activity,
    'at', floor(extract(epoch from clock_timestamp()) * 1000)::bigint),
    'desk_activity', 'room:' || room, true)
$$;
revoke all on function public.send_desk_activity(text, uuid, text) from public, anon, authenticated;

create or replace function public.broadcast_desk_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('desk', new.desk_ref, 'status', new.status,
    'at', floor(extract(epoch from clock_timestamp()) * 1000)::bigint),
    'desk_status', 'room:' || new.room, true);
  if not exists (select 1 from public.sessions where user_id = new.user_id and state = 'active') then
    perform public.send_desk_activity(new.room, new.desk_ref, new.status);
  end if;
  return null;
end;
$$;

create function public.broadcast_focus_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  desk public.room_members;
begin
  if tg_op = 'UPDATE' and (new.state, new.paused_at) is not distinct from (old.state, old.paused_at) then
    return null;
  end if;
  select * into desk from public.room_members where user_id = new.user_id;
  if found then
    perform public.send_desk_activity(desk.room, desk.desk_ref, case
      when new.state = 'active' and new.paused_at is null then 'working'
      when new.state = 'active' then 'break'
      else desk.status end);
  end if;
  return null;
end;
$$;
revoke all on function public.broadcast_focus_activity() from public, anon, authenticated;
create trigger broadcast_focus_activity after insert or update of state, paused_at on public.sessions
  for each row execute function public.broadcast_focus_activity();
