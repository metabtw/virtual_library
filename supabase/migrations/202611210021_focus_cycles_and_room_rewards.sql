alter table public.sessions
  add column break_minutes smallint check (break_minutes between 1 and 60),
  add column last_online_ms bigint,
  add column reconnect_check_until bigint,
  add column break_returned boolean not null default false;

alter table public.room_progress add column cycle_minutes integer not null default 0 check (cycle_minutes between 0 and 179);
update public.room_progress set cycle_minutes = (minutes % 100)::integer;
alter table public.room_chests add column tier text not null default 'basic' references public.study_boxes(tier);

create function public.room_chest_tier(roll integer)
returns text language sql immutable set search_path = '' as $$
  select case when roll < 950 then 'basic' when roll < 999 then 'epic' else 'legendary' end
$$;
revoke all on function public.room_chest_tier(integer) from public, anon, authenticated, service_role;

create or replace function public.credit_study_club()
returns trigger language plpgsql set search_path = '' as $$
declare
  credited integer := (new.end_ms - new.start_ms) / 60000;
  total bigint;
  cycle integer;
  observed bigint := public.library_time_ms();
begin
  if new.state = 'completed' and new.room_id is not null then
    insert into public.room_progress (room_id, minutes, cycle_minutes) values (new.room_id, credited, credited % 180)
      on conflict (room_id) do update set minutes = public.room_progress.minutes + excluded.minutes,
      cycle_minutes = (public.room_progress.cycle_minutes + credited) % 180
      returning minutes, cycle_minutes into total, cycle;
    if cycle < credited then
      insert into public.room_chests (room_id, milestone, user_id, tier)
      select m.room, total, m.user_id, public.room_chest_tier(floor(random() * 1000)::integer)
      from public.room_members m where m.room = new.room_id and m.seen > observed - 15000
      on conflict do nothing;
    end if;
    if new.break_minutes is not null and new.end_ms + new.break_minutes * 60000::bigint > observed then
      update public.room_members set status = 'break' where user_id = new.user_id and room = new.room_id;
    end if;
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

create function public.focus_connection_is_away(actor uuid, observed bigint)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(bool_and(away_tag is not null), false)
  from public.room_connections where user_id = actor and expires_ms > observed
$$;
revoke all on function public.focus_connection_is_away(uuid,bigint) from public, anon, authenticated, service_role;

create function public.advance_focus_period(actor uuid, observed bigint, foreground boolean)
returns integer language plpgsql set search_path = '' as $$
declare
  period public.sessions;
  due bigint;
  deadline bigint;
  disconnected boolean;
  away boolean;
  reward integer;
begin
  select * into period from public.sessions where user_id = actor and state = 'active';
  if not found then return 0; end if;
  due := period.next_check_at;
  deadline := coalesce(period.reconnect_check_until, due + 30000);
  away := period.last_online_ms is not null and public.focus_connection_is_away(actor, observed);
  disconnected := not away and coalesce(period.last_online_ms + 15000 <= observed, false);

  if not away and period.last_online_ms + 300000 <= observed then
    update public.sessions set state = 'invalid' where id = period.id;
    return 0;
  end if;
  if due is not null and deadline <= observed then
    if not away and period.reconnect_check_until is null and period.last_online_ms < deadline then
      -- A foreground heartbeat distinguishes a missed check from a network gap.
      if not foreground then return 0; end if;
      if period.last_online_ms + 8000 > observed then
        update public.sessions set state = 'invalid' where id = period.id;
        return 0;
      end if;
      update public.sessions set reconnect_check_until = observed + 30000 where id = period.id;
    else
      update public.sessions set state = 'invalid' where id = period.id;
      return 0;
    end if;
  elsif period.paused_at is null and period.end_ms <= observed and due is null and (foreground or not disconnected) then
    reward := (period.end_ms - period.start_ms) / 300000;
    update public.sessions set state = 'completed' where id = period.id;
    perform public.grant_study_coins(actor, period.id::text, reward);
    return reward;
  end if;
  return 0;
end;
$$;
revoke all on function public.advance_focus_period(uuid, bigint, boolean) from public, anon, authenticated, service_role;

create or replace function public.settle_due_focus_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  observed bigint := public.library_time_ms();
  pending record;
  changed integer := 0;
begin
  for pending in
    select s.id, s.user_id from public.sessions s
    where s.state = 'active' and (
      (s.last_online_ms + 300000 <= observed and not public.focus_connection_is_away(s.user_id, observed)) or
      (s.next_check_at is not null and coalesce(s.reconnect_check_until, s.next_check_at + 30000) <= observed and
        (s.reconnect_check_until is not null or s.last_online_ms is null or s.last_online_ms >= s.next_check_at + 30000
          or public.focus_connection_is_away(s.user_id, observed))) or
      (s.paused_at is null and s.end_ms <= observed and s.next_check_at is null and
        (s.last_online_ms is null or s.last_online_ms + 15000 > observed
          or public.focus_connection_is_away(s.user_id, observed)))
    ) order by s.end_ms, s.id limit 250
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('user:' || pending.user_id::text, 0)) then continue; end if;
    perform public.advance_focus_period(pending.user_id, observed, false);
    if exists(select 1 from public.sessions where id = pending.id and state <> 'active') then changed := changed + 1; end if;
  end loop;
  return changed;
end;
$$;

create or replace function public.sync_room_connections(actor uuid, observed bigint)
returns boolean language plpgsql set search_path = '' as $$
declare
  lease bigint;
  tag text;
  focus_lease bigint;
begin
  select max(expires_ms), case when not bool_or(away_tag is null)
    then (array_agg(away_tag order by expires_ms desc, client_id))[1] end
  into lease, tag from public.room_connections where user_id = actor and expires_ms > observed;
  if lease is null then return false; end if;
  if tag is null then
    select s.last_online_ms + 300000 into focus_lease from public.sessions s
    join public.room_members m on m.user_id = s.user_id and m.room = s.room_id
    where s.user_id = actor and s.break_minutes is not null and (
      s.state = 'active' or (s.state = 'completed' and not s.break_returned and s.end_ms + s.break_minutes * 60000::bigint > observed))
    order by s.start_ms desc limit 1;
    lease := greatest(lease, focus_lease);
  end if;
  update public.room_members set seen = lease - 15000, away_tag = tag where user_id = actor;
  return true;
end;
$$;

create or replace function public.room_member_activity(member public.room_members, observed bigint)
returns text language sql set search_path = '' as $$
  select case when member.missed_check or exists (
      select 1 from public.sessions where user_id = member.user_id and state = 'active'
        and coalesce(reconnect_check_until, next_check_at + 30000) <= observed
        and (reconnect_check_until is not null or last_online_ms is null
          or last_online_ms >= next_check_at + 30000)
    ) then 'missedCheck'
    when member.away_tag is not null then member.away_tag
    when exists (select 1 from public.sessions where user_id = member.user_id and state = 'active'
      and paused_at is null and end_ms > observed) then 'working'
    else member.status end
$$;

create or replace function public.exit_library_room(actor uuid, observed bigint)
returns void language plpgsql set search_path = '' as $$
declare
  location text;
begin
  select room into location from public.room_members where user_id = actor;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('room:' || location, 0));
  delete from public.room_members where user_id = actor;
  update public.sessions set state = 'invalid' where user_id = actor and state = 'active' and
    (break_minutes is not null or ((paused_at is not null or end_ms > observed) and (next_check_at is null or next_check_at + 30000 > observed)));
  update public.sessions set break_returned = true where user_id = actor and room_id = location and state = 'completed'
    and break_minutes is not null and not break_returned;
end;
$$;

create or replace function public.library_core_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  profile public.profiles;
  membership public.room_members;
  session public.sessions;
  entry public.items;
  instant bigint;
  due bigint;
  check_deadline bigint;
  break_length integer;
  pause_ms bigint;
  reward integer;
  duration integer;
  destination text;
  capacity integer;
  occupied integer;
  requested_status text;
  response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
  instant := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  select * into profile from public.profiles where id = actor;
  select * into membership from public.room_members where user_id = actor;
  reward := public.advance_focus_period(actor, instant, coalesce(payload->>'foreground', 'true') = 'true');
  select * into session from public.sessions where user_id = actor and state = 'active';
  due := session.next_check_at;
  check_deadline := coalesce(session.reconnect_check_until, due + 30000);
  if session.id is not null and session.break_minutes is not null and coalesce(payload->>'foreground','true') = 'true' then
    update public.sessions set last_online_ms = instant where id = session.id;
  end if;

  if session.id is not null and session.paused_at is null and action not in ('state','status','verify') then
    return jsonb_build_object('error', 'working');
  end if;
  if profile.id is null and action not in ('state','profile') then
    return jsonb_build_object('error', 'profileRequired');
  end if;

  if action = 'profile' then
    if nullif(trim(payload->>'name'), '') is null or char_length(trim(payload->>'name')) not between 2 and 24
      or coalesce(payload->>'gender', '') not in ('unspecified','female','male')
      or coalesce(payload->>'hair', '') not in ('0','1','2') or coalesce(payload->>'outfit', '') not in ('0','1','2')
      or coalesce(payload->>'color', '') not in ('#bd7050','#789078','#7988ab','#ad7963')
      or coalesce(payload->>'hair_style', '3') not in ('3','4','5','6')
      or coalesce(payload->>'outfit_style', '3') not in ('3','4','5')
      or coalesce(payload->>'skin_tone', '0') not in ('0','1','2','3','4')
      or coalesce(payload->>'hair_color', '0') not in ('0','1','2','3','4')
      or coalesce(payload->>'beard', '0') not in ('0','1','2') then
      return jsonb_build_object('error', 'invalidAvatar');
    end if;
    insert into public.profiles(id, name) values(actor, trim(payload->>'name'))
      on conflict (id) do update set name = excluded.name;
    if profile.id is null then
      insert into public.coin_ledger values ('welcome:' || actor, actor, 30);
    end if;
    insert into public.avatars (user_id, gender, hair, outfit, color, hair_style, outfit_style, skin_tone, hair_color, beard)
    values (actor, payload->>'gender', (payload->>'hair')::int, (payload->>'outfit')::int, payload->>'color',
      (payload->>'hair_style')::int, (payload->>'outfit_style')::int,
      coalesce((payload->>'skin_tone')::int, 0), coalesce((payload->>'hair_color')::int, 0),
      coalesce((payload->>'beard')::int, 0))
    on conflict (user_id) do update set gender = excluded.gender, hair = excluded.hair,
      outfit = excluded.outfit, color = excluded.color,
      hair_style = case when payload ? 'hair_style' or excluded.hair <> avatars.hair
        then excluded.hair_style else avatars.hair_style end,
      outfit_style = case when payload ? 'outfit_style' or excluded.outfit <> avatars.outfit
        then excluded.outfit_style else avatars.outfit_style end,
      skin_tone = coalesce((payload->>'skin_tone')::int, avatars.skin_tone),
      hair_color = coalesce((payload->>'hair_color')::int, avatars.hair_color),
      beard = coalesce((payload->>'beard')::int, avatars.beard);
  end if;

  if action = 'join' or membership.seen <= instant - 15000 then
    destination := case when action = 'join' then payload->>'room' else membership.room end;
    select r.capacity into capacity from public.rooms r where id = destination;
    if capacity is null then return jsonb_build_object('error', 'roomMissing'); end if;
    perform pg_advisory_xact_lock(hashtextextended('room:' || destination, 0));
    instant := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
    select count(*) into occupied from public.room_members
      where room = destination and user_id <> actor and seen > instant - 15000;
    if occupied >= capacity then
      if action = 'join' then return jsonb_build_object('error', 'roomFull'); end if;
      delete from public.room_members where user_id = actor;
      membership := null;
    else
      insert into public.room_members(user_id, room, status, since, seen)
        values(actor, destination, coalesce(membership.status, 'desk'), instant, instant)
        on conflict (user_id) do update set room = excluded.room, since = excluded.since, seen = excluded.seen
        returning * into membership;
    end if;
  end if;

  case action
    when 'leave' then
      delete from public.room_members where user_id = actor;
    when 'status' then
      requested_status := coalesce(payload->>'status', '');
      if requested_status not in ('desk','break') then return jsonb_build_object('error', 'invalidStatus'); end if;
      if requested_status = 'desk' and membership.room is null then
        return jsonb_build_object('error', 'roomMissing');
      end if;
      if session.id is not null then
        if requested_status = 'break' and session.paused_at is null then
          update public.sessions set paused_at = instant,
            verification_due = case when due < session.end_ms and due <= instant then due end,
            reconnect_check_until = case when due <= instant then session.reconnect_check_until end
            where id = session.id;
        elsif requested_status = 'desk' and session.paused_at is not null then
          pause_ms := instant - session.paused_at;
          update public.sessions set start_ms = start_ms + pause_ms, end_ms = end_ms + pause_ms,
            paused_at = null where id = session.id;
        end if;
      end if;
      update public.room_members set status = requested_status where user_id = actor;
    when 'start' then
      if coalesce(payload->>'duration', '') !~ '^[0-9]{1,3}$'
        or jsonb_typeof(payload->'duration') <> 'number' then
        return jsonb_build_object('error', 'invalidDuration');
      end if;
      duration := (payload->>'duration')::int;
      if membership.room is null or session.id is not null or duration not between 5 and 180 then
        return jsonb_build_object('error', 'invalidDuration');
      end if;
      if payload ? 'breakMinutes' then
        if jsonb_typeof(payload->'breakMinutes') is distinct from 'number'
          or coalesce(payload->>'breakMinutes','') !~ '^[0-9]{1,2}$'
          or (payload->>'breakMinutes')::integer not between 1 and 60 then
          return jsonb_build_object('error', 'invalidBreakMinutes');
        end if;
        break_length := (payload->>'breakMinutes')::integer;
      end if;
      if exists (select 1 from public.sessions p where p.user_id = actor and p.room_id = membership.room
        and p.state = 'completed' and not p.break_returned and p.end_ms + p.break_minutes * 60000::bigint > instant) then
        return jsonb_build_object('error', 'breakInProgress');
      end if;
      insert into public.sessions(user_id, start_ms, end_ms, break_minutes, last_online_ms)
        values(actor, instant, instant + duration * 60000, break_length, case when break_length is not null then instant end);
      update public.room_members set status = 'desk' where user_id = actor;
    when 'verify' then
      if session.id is null or due is null or due >= session.end_ms or instant < due or instant >= check_deadline then
        return jsonb_build_object('error', 'verificationClosed');
      end if;
      update public.sessions set checks = checks + 1, verification_due = null, reconnect_check_until = null where id = session.id;
    when 'buy' then
      select * into entry from public.items where id = payload->>'item';
      if entry.id is null then return jsonb_build_object('error', 'itemMissing'); end if;
      if exists(select 1 from public.user_items where user_id = actor and item = entry.id) then
        return jsonb_build_object('error', 'itemOwned');
      end if;
      update public.profiles set coins = coins - entry.price where id = actor and coins >= entry.price;
      if not found then return jsonb_build_object('error', 'insufficientCoins'); end if;
      insert into public.user_items(user_id, item) values(actor, entry.id);
      insert into public.coin_ledger values (gen_random_uuid()::text, actor, -entry.price);
    when 'place' then
      update public.user_items set placed = not placed where user_id = actor and item = payload->>'item';
      if not found then return jsonb_build_object('error', 'itemMissing'); end if;
    else null;
  end case;

  update public.room_members set seen = instant where user_id = actor returning * into membership;
  select jsonb_build_object(
    'now', instant,
    'awarded', nullif(reward, 0),
    'profile', (select jsonb_build_object('name', p.name, 'coins', p.coins,
      'room', membership.room, 'status', membership.status, 'avatar', to_jsonb(a) - 'user_id')
      from public.profiles p join public.avatars a on a.user_id = p.id where p.id = actor),
    'session', (select jsonb_build_object('start', s.start_ms, 'end', s.end_ms,
      'checks', s.checks, 'state', s.state, 'paused_at', s.paused_at, 'verification_due', s.verification_due)
      from public.sessions s where s.user_id = actor order by s.start_ms desc limit 1),
    'rooms', (select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('count', (
      select count(*) from public.room_members where room = r.id and seen > instant - 15000
    )) order by r.id), '[]') from public.rooms r),
    'items', (select coalesce(jsonb_agg(i order by i.price, i.id), '[]') from public.items i),
    'inventory', (select coalesce(jsonb_agg(to_jsonb(u) - 'user_id'), '[]')
      from public.user_items u where u.user_id = actor),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('own', m.user_id = actor,
      'name', p.name, 'status', m.status, 'avatar', to_jsonb(a) - 'user_id', 'placed', (
        select coalesce(jsonb_agg(u.item order by u.item), '[]') from public.user_items u
          where u.user_id = m.user_id and u.placed
      )) order by m.since, m.user_id), '[]')
      from public.room_members m join public.profiles p on p.id = m.user_id
      join public.avatars a on a.user_id = m.user_id
      where m.room = membership.room and m.seen > instant - 15000)
  ) into response;
  return response;
end;
$$;

create or replace function public.open_study_box(actor uuid, chosen_tier text, room_chest boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  box_price integer;
  prize text;
  chest public.room_chests;
begin
  if room_chest then
    select * into chest from public.room_chests where user_id = actor and not opened
      order by milestone, room_id limit 1 for update;
    if not found then return jsonb_build_object('error', 'noChest'); end if;
    chosen_tier := chest.tier;
  end if;

  select price into box_price from public.study_boxes where tier = chosen_tier;
  if not found then return jsonb_build_object('error', 'invalidBox'); end if;

  -- Exponential sampling selects each unowned item in proportion to its weight.
  select reward.item into prize from public.study_box_rewards reward
    where reward.tier = chosen_tier and not exists (
      select 1 from public.user_items owned where owned.user_id = actor and owned.item = reward.item)
    order by -ln(1 - random()) / reward.weight limit 1;

  if room_chest then
    update public.room_chests set opened = true
      where room_id = chest.room_id and milestone = chest.milestone and user_id = actor;
  else
    if prize is null then return jsonb_build_object('error', 'collectionComplete'); end if;
    update public.profiles set coins = coins - box_price where id = actor and coins >= box_price;
    if not found then return jsonb_build_object('error', 'insufficientCoins'); end if;
    insert into public.coin_ledger values ('box:' || chosen_tier || ':' || gen_random_uuid(), actor, -box_price);
  end if;

  if prize is null then
    perform public.grant_study_coins(actor, 'chest:' || gen_random_uuid(), 10);
    return jsonb_build_object('coins', 10, 'tier', chosen_tier);
  end if;
  insert into public.user_items (user_id, item) values (actor, prize);
  return jsonb_build_object('item', prize, 'tier', chosen_tier);
end;
$$;

create table public.weekly_prize_rounds (
  week_start date primary key
);
alter table public.weekly_prize_rounds enable row level security;
revoke all on public.weekly_prize_rounds from public, anon, authenticated;
insert into public.weekly_prize_rounds values
  ((date_trunc('week', clock_timestamp() at time zone 'Europe/Istanbul')::date - 7));

create function public.award_weekly_placements(observed timestamptz)
returns void language plpgsql set search_path = '' as $$
declare
  week_start date;
  current_monday date := date_trunc('week', observed at time zone 'Europe/Istanbul')::date;
  week_end date;
  winner record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('weekly-placement-prizes', 0)) then return; end if;
  select max(r.week_start) + 7 into week_start from public.weekly_prize_rounds r;
  while week_start < current_monday loop
    week_end := week_start + 7;
    -- An eligible session that ended just before midnight can still reconnect and check in.
    if (week_end::timestamp at time zone 'Europe/Istanbul') + interval '6 minutes' > observed then return; end if;
    for winner in
      with totals as (
        select p.id, sum((s.end_ms - s.start_ms) / 60000) as minutes, max(s.end_ms) as last_finish
        from public.sessions s join public.profiles p on p.id = s.user_id
        where p.leaderboard_visible and s.state = 'completed'
          and s.end_ms >= extract(epoch from (week_start::timestamp at time zone 'Europe/Istanbul')) * 1000
          and s.end_ms < extract(epoch from (week_end::timestamp at time zone 'Europe/Istanbul')) * 1000
        group by p.id
      )
      select * from (
        select id, row_number() over (order by minutes desc, last_finish, id) as position from totals
        order by minutes desc, last_finish, id limit 3
      ) leaders order by id
    loop
      if not pg_try_advisory_xact_lock(hashtextextended('user:' || winner.id::text, 0)) then return; end if;
      perform public.grant_study_coins(winner.id, format('ranking:%s:%s:%s', week_start, winner.position, winner.id),
        (array[10,5,3])[winner.position::integer]);
    end loop;
    insert into public.weekly_prize_rounds values (week_start) on conflict do nothing;
    week_start := week_start + 7;
  end loop;
end;
$$;
revoke all on function public.award_weekly_placements(timestamptz) from public, anon, authenticated, service_role;

alter function public.settle_focus_sessions() rename to settle_rooms_before_prizes;
revoke all on function public.settle_rooms_before_prizes() from public, anon, authenticated, service_role;
create function public.settle_focus_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  settled integer;
begin
  settled := public.settle_rooms_before_prizes();
  perform public.award_weekly_placements(clock_timestamp());
  return settled;
end;
$$;
revoke all on function public.settle_focus_sessions() from public, anon, authenticated;
grant execute on function public.settle_focus_sessions() to service_role;

alter function public.reader_social_action(uuid, text, jsonb, text) rename to reader_social_before_duplicate_check;
revoke all on function public.reader_social_before_duplicate_check(uuid,text,jsonb,text) from public, anon, authenticated, service_role;
create function public.reader_social_action(actor uuid, action text, payload jsonb, current_room text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  peer uuid;
  existing public.reader_friendships;
begin
  if action <> 'addFriend' then
    return public.reader_social_before_duplicate_check(actor, action, payload, current_room);
  end if;
  select p.id into peer from public.profiles p where p.reader_code = upper(trim(payload->>'code')) and p.id <> actor;
  if peer is null then return jsonb_build_object('error','friendMissing'); end if;
  insert into public.reader_friendships(reader_a, reader_b, requested_by)
    values (least(actor, peer), greatest(actor, peer), actor) on conflict (reader_a, reader_b) do nothing;
  if found then return null; end if;
  select * into existing from public.reader_friendships where reader_a = least(actor, peer) and reader_b = greatest(actor, peer);
  return jsonb_build_object('error', case when existing.accepted then 'alreadyFriends' else 'friendPending' end);
end;
$$;
revoke all on function public.reader_social_action(uuid,text,jsonb,text) from public, anon, authenticated, service_role;

create function public.charge_reaction_coffee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind <> 'coffee' then return new; end if;
  update public.profiles set coins = coins - 1 where id = new.from_user and coins >= 1;
  if not found then raise exception using message = 'insufficientCoins', errcode = 'P2101'; end if;
  insert into public.coin_ledger (reference,user_id,amount) values ('coffee:' || new.id, new.from_user, -1);
  return new;
end;
$$;
revoke all on function public.charge_reaction_coffee() from public, anon, authenticated, service_role;
create trigger charge_reaction_coffee after insert or update of kind, id on public.desk_reactions
  for each row execute function public.charge_reaction_coffee();

alter function public.library_action(uuid, text, jsonb) rename to library_before_focus_cycles;
revoke all on function public.library_before_focus_cycles(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
  period public.sessions;
  current_room text;
  observed bigint;
  break_end bigint;
  focus_live jsonb;
  current_awards jsonb;
  weekly_award jsonb;
  ranking_start bigint;
  ranking_end bigint;
begin
  if action = 'leaderboard' then
    snapshot := public.library_before_focus_cycles(actor, action, payload);
    if snapshot ? 'error' then return snapshot; end if;
    ranking_start := (extract(epoch from ((snapshot->>'starts')::date::timestamp at time zone 'Europe/Istanbul')) * 1000)::bigint;
    ranking_end := ranking_start + 604800000;
    with totals as (
      select p.id, p.name, sum((s.end_ms - s.start_ms) / 60000) as minutes, max(s.end_ms) as last_finish
      from public.sessions s join public.profiles p on p.id = s.user_id
      where p.leaderboard_visible and s.state = 'completed' and s.end_ms >= ranking_start and s.end_ms < ranking_end
      group by p.id,p.name
    ), ranked as (
      select id,name,minutes,row_number() over (order by minutes desc,last_finish,id) as rank from totals
    )
    select snapshot || jsonb_build_object('own', (select jsonb_build_object('rank', rank,'minutes',minutes) from ranked where id=actor),
      'rows', (select coalesce(jsonb_agg(to_jsonb(r) - 'id' order by rank),'[]')
        from (select * from ranked order by rank limit 20) r)) into snapshot;
    return snapshot;
  end if;

  begin
    snapshot := public.library_before_focus_cycles(actor, action, payload);
  exception when sqlstate 'P2101' then
    return jsonb_build_object('error', 'insufficientCoins');
  end;
  if snapshot ? 'error' or jsonb_typeof(snapshot->'profile') is distinct from 'object' then return snapshot; end if;
  observed := (snapshot->>'now')::bigint;
  current_room := snapshot#>>'{profile,room}';

  select * into period from public.sessions s where s.user_id = actor order by s.start_ms desc limit 1;
  if period.state = 'active' and period.break_minutes is not null then
    snapshot := jsonb_set(snapshot, '{session}', (snapshot->'session') || jsonb_build_object(
      'check_until', coalesce(period.reconnect_check_until, period.next_check_at + 30000),
      'disconnectDeadline', period.last_online_ms + 300000));
  elsif period.state = 'completed' and period.break_minutes is not null and period.room_id = current_room and not period.break_returned then
    break_end := period.end_ms + period.break_minutes * 60000::bigint;
    if break_end <= observed then
      update public.sessions set break_returned = true where id = period.id;
      update public.room_members set status = 'desk' where user_id = actor and room = current_room;
      snapshot := jsonb_set(snapshot, '{profile,status}', '"desk"');
    elsif coalesce(payload->>'foreground','true') = 'true' then
      update public.sessions set last_online_ms = observed where id = period.id;
      perform public.sync_room_connections(actor, observed);
    end if;
    snapshot := snapshot || jsonb_build_object('autoBreak', jsonb_build_object('id', period.id, 'endsAt', break_end));
  end if;

  if current_room is not null then
    select coalesce(jsonb_agg(jsonb_build_object('start',s.start_ms, 'until',
      least(s.end_ms, s.paused_at, coalesce(s.reconnect_check_until, s.next_check_at + 30000), case when not public.focus_connection_is_away(s.user_id, observed) then s.last_online_ms + 300000 end))), '[]')
    into focus_live
    from public.sessions s join public.room_members m on m.user_id = s.user_id and m.room = s.room_id
    where s.room_id = current_room and s.state = 'active' and m.seen > observed - 15000
      and (s.last_online_ms is null or s.last_online_ms + 300000 > observed or public.focus_connection_is_away(s.user_id, observed))
      and (s.next_check_at is null or coalesce(s.reconnect_check_until, s.next_check_at + 30000) > observed
        or (s.reconnect_check_until is null and s.last_online_ms < s.next_check_at + 30000 and s.last_online_ms + 8000 <= observed));
    snapshot := snapshot || jsonb_build_object('roomGoal', jsonb_build_object(
      'settled', coalesce((select cycle_minutes from public.room_progress where room_id=current_room),0), 'live', focus_live
    ));
  end if;

  -- Weekly prizes are settled overnight and need to be visible when a reader next signs in.
  select jsonb_build_object('id',md5(reference),'amount',amount,'reason','ranking')
  into weekly_award from public.coin_ledger where user_id = actor and amount > 0
    and credited_at >= to_timestamp(observed / 1000.0) - interval '7 days' and reference like 'ranking:%'
  order by credited_at desc, reference desc limit 1;
  if weekly_award is null then return snapshot; end if;
  select coalesce(jsonb_agg(award order by position),'[]')
  into current_awards from jsonb_array_elements(snapshot->'coinAwards') with ordinality entries(award,position)
  where award->>'id' <> weekly_award->>'id';
  return snapshot || jsonb_build_object('coinAwards', current_awards || jsonb_build_array(weekly_award));
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
