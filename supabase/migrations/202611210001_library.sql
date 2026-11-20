create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 24),
  coins integer not null default 30 check (coins >= 0)
);

create table public.avatars (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gender text not null check (gender in ('unspecified', 'female', 'male')),
  hair integer not null check (hair between 0 and 2),
  outfit integer not null check (outfit between 0 and 2),
  color text not null check (color in ('#bd7050', '#789078', '#7988ab', '#ad7963'))
);

create table public.rooms (
  id text primary key,
  name text not null,
  name_en text not null,
  capacity integer not null default 9 check (capacity = 9)
);

create table public.room_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  room text not null references public.rooms(id),
  status text not null default 'desk' check (status in ('desk', 'break')),
  since bigint not null,
  seen bigint not null
);
create index room_live_members on public.room_members(room, seen);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_ms bigint not null,
  end_ms bigint not null,
  checks integer not null default 0,
  state text not null default 'active' check (state in ('active', 'completed', 'invalid')),
  paused_at bigint,
  verification_due bigint
);
create unique index single_running_session on public.sessions(user_id) where state = 'active';
create index latest_sessions on public.sessions(user_id, start_ms desc);

create table public.coin_ledger (
  reference text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null
);

create table public.items (
  id text primary key,
  name text not null,
  name_en text not null,
  price integer not null check (price > 0)
);

create table public.user_items (
  user_id uuid references public.profiles(id) on delete cascade,
  item text references public.items(id),
  placed boolean not null default false,
  primary key (user_id, item)
);

insert into public.rooms(id, name, name_en) values
  ('night', 'Gece Kuşları Kütüphanesi', 'Night Owls Library'),
  ('garden', 'Cam Bahçe', 'Glass Garden'),
  ('archive', 'Eski Arşiv', 'Old Archive');

insert into public.items(id, name, name_en, price) values
  ('lamp', 'Masa Lambası', 'Desk Lamp', 10), ('plant', 'Monstera', 'Monstera', 20),
  ('cat', 'Gezgin Kedi', 'Wandering Cat', 30), ('sweater', 'Turuncu Kazak', 'Orange Sweater', 20);

alter table public.profiles enable row level security;
alter table public.avatars enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.sessions enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.items enable row level security;
alter table public.user_items enable row level security;

revoke all on public.profiles, public.avatars, public.rooms, public.room_members, public.sessions,
  public.coin_ledger, public.items, public.user_items from anon, authenticated;
grant select on public.profiles, public.avatars, public.rooms, public.room_members, public.sessions,
  public.coin_ledger, public.items, public.user_items to authenticated;

create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_avatar on public.avatars for select to authenticated using (user_id = (select auth.uid()));
create policy list_rooms on public.rooms for select to authenticated using (true);
create policy own_membership on public.room_members for select to authenticated using (user_id = (select auth.uid()));
create policy own_sessions on public.sessions for select to authenticated using (user_id = (select auth.uid()));
create policy own_ledger on public.coin_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy list_items on public.items for select to authenticated using (true);
create policy own_items on public.user_items for select to authenticated using (user_id = (select auth.uid()));

create policy room_presence_read on realtime.messages for select to authenticated using (
  extension = 'presence' and exists (
    select 1 from public.room_members where user_id = (select auth.uid())
      and 'room:' || room = (select realtime.topic())
  )
);
create policy room_presence_send on realtime.messages for insert to authenticated with check (
  extension = 'presence' and exists (
    select 1 from public.room_members where user_id = (select auth.uid())
      and 'room:' || room = (select realtime.topic())
  )
);

-- This RPC is only callable by the authenticated Edge Function's service client.
-- The per-user lock serializes balance, session and heartbeat operations across devices.
create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  profile public.profiles;
  membership public.room_members;
  session public.sessions;
  entry public.items;
  instant bigint;
  due bigint;
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
  select * into session from public.sessions where user_id = actor and state = 'active';
  if session.id is not null then
    due := coalesce(session.verification_due, case when session.paused_at is null
      then session.start_ms + (session.checks + 1) * 1200000 end);
    if due < session.end_ms and instant >= due + 30000 then
      update public.sessions set state = 'invalid' where id = session.id;
      session.id := null;
    elsif session.paused_at is null and instant >= session.end_ms then
      reward := (session.end_ms - session.start_ms) / 300000;
      update public.sessions set state = 'completed' where id = session.id;
      insert into public.coin_ledger values (session.id::text, actor, reward);
      update public.profiles set coins = coins + reward where id = actor;
      session.id := null;
    end if;
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
      or coalesce(payload->>'color', '') not in ('#bd7050','#789078','#7988ab','#ad7963') then
      return jsonb_build_object('error', 'invalidAvatar');
    end if;
    insert into public.profiles(id, name) values(actor, trim(payload->>'name'))
      on conflict (id) do update set name = excluded.name;
    if profile.id is null then
      insert into public.coin_ledger values ('welcome:' || actor, actor, 30);
    end if;
    insert into public.avatars values(actor, payload->>'gender', (payload->>'hair')::int, (payload->>'outfit')::int, payload->>'color')
      on conflict (user_id) do update set gender = excluded.gender, hair = excluded.hair,
        outfit = excluded.outfit, color = excluded.color;
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
            verification_due = case when due < session.end_ms and due <= instant then due end
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
      insert into public.sessions(user_id, start_ms, end_ms) values(actor, instant, instant + duration * 60000);
      update public.room_members set status = 'desk' where user_id = actor;
    when 'verify' then
      if session.id is null or due is null or due >= session.end_ms or instant < due or instant >= due + 30000 then
        return jsonb_build_object('error', 'verificationClosed');
      end if;
      update public.sessions set checks = checks + 1, verification_due = null where id = session.id;
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
    'awarded', reward,
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

revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
