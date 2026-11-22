alter table public.profiles add column target text not null default '' check (char_length(target) <= 48);
alter table public.rooms
  add column is_private boolean not null default false,
  add column owner_id uuid references public.profiles(id) on delete set null;
alter table public.sessions add column room_id text references public.rooms(id) on delete set null;
alter table public.items add column kind text not null default 'desk' check (kind in ('desk','wearable','ambience','rare'));
update public.items set kind = 'wearable' where id = 'sweater';

create table public.private_room_invites (
  room_id text primary key references public.rooms(id) on delete cascade,
  code text not null unique check (code ~ '^[0-9]{6}$')
);
create table public.private_room_access (
  room_id text references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (room_id, user_id)
);
create table public.room_invite_attempts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  since timestamptz not null,
  attempts integer not null
);

create table public.room_progress (
  room_id text primary key references public.rooms(id) on delete cascade,
  minutes bigint not null default 0 check (minutes >= 0)
);
create table public.room_chests (
  room_id text references public.rooms(id) on delete cascade,
  milestone bigint not null check (milestone > 0),
  user_id uuid references public.profiles(id) on delete cascade,
  opened boolean not null default false,
  primary key (room_id, milestone, user_id)
);
create index room_chests_unopened on public.room_chests (user_id) where not opened;
create table public.pets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp integer not null check (xp >= 0),
  upset boolean not null
);

alter table public.private_room_invites enable row level security;
alter table public.private_room_access enable row level security;
alter table public.room_invite_attempts enable row level security;
alter table public.room_progress enable row level security;
alter table public.room_chests enable row level security;
alter table public.pets enable row level security;
revoke all on public.private_room_invites, public.private_room_access, public.room_invite_attempts,
  public.room_progress, public.room_chests, public.pets from anon, authenticated;
grant select on public.private_room_access to authenticated;
create policy own_private_access on public.private_room_access for select to authenticated
  using (user_id = (select auth.uid()));
revoke select on public.rooms from authenticated;
grant select (id, name, name_en, capacity, is_private) on public.rooms to authenticated;
drop policy list_rooms on public.rooms;
create policy list_rooms on public.rooms for select to authenticated using (
  not is_private or (owner_id is not null and exists (
    select 1 from public.private_room_access where room_id = rooms.id and user_id = (select auth.uid())
  ))
);

insert into public.items(id, name, name_en, price, kind) values
  ('goldKeys','Altın Klavye','Golden Keyboard',50,'rare'),
  ('dragon','Uyuyan Ejderha Yavrusu','Sleeping Baby Dragon',50,'rare'),
  ('neon','Neon Lamba','Neon Lamp',50,'rare'),
  ('space','Uzay İstasyonu','Space Station',30,'ambience'),
  ('forest','Orman Kulübesi','Forest Cabin',30,'ambience');

-- Credit the room where the session started, including sessions settled by the cron worker.
create function public.credit_study_club()
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
    if total / 500 > (total - credited) / 500 then
      insert into public.room_chests (room_id, milestone, user_id)
        select m.room, total / 500, m.user_id from public.room_members m
        where m.room = new.room_id and m.seen > observed - 15000
        on conflict do nothing;
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
revoke all on function public.credit_study_club() from public, anon, authenticated;
create trigger reward_study_club after update of state on public.sessions
  for each row when (old.state = 'active' and new.state in ('completed', 'invalid'))
  execute function public.credit_study_club();

create function public.close_owned_room()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('room:' || new.id, 0));
  delete from public.room_members where room = new.id;
  delete from public.private_room_invites where room_id = new.id;
  delete from public.private_room_access where room_id = new.id;
  return new;
end;
$$;
revoke all on function public.close_owned_room() from public, anon, authenticated;
create trigger owner_removed after update of owner_id on public.rooms
  for each row when (old.owner_id is not null and new.owner_id is null)
  execute function public.close_owned_room();

alter function public.library_action(uuid, text, jsonb) rename to library_core_action;
revoke all on function public.library_core_action(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
  next_snapshot jsonb;
  is_new_action boolean := action in ('target','createRoom','joinCode','openBox','openChest','abandon');
  room_key text;
  invite text;
  seed bytea;
  tries integer;
  retry_after timestamptz := clock_timestamp() - interval '1 minute';
  rare_item text;
  chest public.room_chests;
  drop_info jsonb;
  now_ms bigint;
  room_title text;
  item_kind text;
begin
  perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));

  if action = 'join' and exists (select 1 from public.rooms where id = payload->>'room' and is_private) then
    perform pg_advisory_xact_lock(hashtextextended('room:' || (payload->>'room'), 0));
    if not exists (
      select 1 from public.rooms r join public.private_room_access a on a.room_id = r.id
      where r.id = payload->>'room' and r.owner_id is not null and a.user_id = actor
    ) then return jsonb_build_object('error','inviteRequired'); end if;
  end if;
  if action in ('buy','place') then
    select kind into item_kind from public.items where id = payload->>'item';
    if (action = 'buy' and item_kind = 'rare') or (action = 'place' and item_kind = 'ambience') then
      return jsonb_build_object('error','itemMissing');
    end if;
  end if;

  snapshot := public.library_core_action(actor, case when is_new_action then 'state' else action end, payload);
  if snapshot ? 'error' then return snapshot; end if;
  if action = 'start' then
    update public.sessions set room_id = snapshot#>>'{profile,room}' where user_id = actor and state = 'active';
  end if;

  if is_new_action then
    if jsonb_typeof(snapshot->'profile') = 'null' then return jsonb_build_object('error','profileRequired'); end if;
    if action <> 'abandon' and snapshot#>>'{session,state}' = 'active' and snapshot#>>'{session,paused_at}' is null then
      return jsonb_build_object('error','working');
    end if;
    case action
      when 'target' then
        if coalesce(jsonb_typeof(payload->'target'), '') <> 'string'
          or char_length(payload->>'target') > 48 or (payload->>'target') ~ '[[:cntrl:]]' then
          return jsonb_build_object('error','invalidTarget');
        end if;
        update public.profiles set target = trim(payload->>'target') where id = actor;
      when 'createRoom' then
        room_title := trim(payload->>'name');
        if coalesce(jsonb_typeof(payload->'name'), '') <> 'string'
          or char_length(room_title) not between 2 and 32 or room_title ~ '[[:cntrl:]]' then
          return jsonb_build_object('error','invalidRoomName');
        end if;
        update public.profiles set coins = coins - 10 where id = actor and coins >= 10;
        if not found then return jsonb_build_object('error','insufficientCoins'); end if;
        room_key := 'private-' || gen_random_uuid()::text;
        insert into public.rooms(id, name, name_en, is_private, owner_id) values(room_key, room_title, room_title, true, actor);
        loop
          seed := uuid_send(gen_random_uuid());
          invite := lpad(((get_byte(seed,0)::bigint * 16777216 + get_byte(seed,1) * 65536 +
            get_byte(seed,2) * 256 + get_byte(seed,3)) % 1000000)::text, 6, '0');
          insert into public.private_room_invites(room_id, code) values(room_key, invite) on conflict (code) do nothing;
          exit when found;
        end loop;
        insert into public.private_room_access values(room_key, actor);
        insert into public.coin_ledger values('room:' || room_key, actor, -10);
      when 'joinCode' then
        if coalesce(payload->>'code','') !~ '^[0-9]{6}$' then return jsonb_build_object('error','invalidInvite'); end if;
        insert into public.room_invite_attempts (user_id, since, attempts) values (actor, clock_timestamp(), 1)
          on conflict (user_id) do update set
            attempts = case when public.room_invite_attempts.since <= retry_after then 1 else public.room_invite_attempts.attempts + 1 end,
            since = case when public.room_invite_attempts.since <= retry_after then excluded.since else public.room_invite_attempts.since end
          where public.room_invite_attempts.since <= retry_after or public.room_invite_attempts.attempts < 6
          returning attempts into tries;
        if tries is null then return jsonb_build_object('error','inviteLimited'); end if;
        select r.id into room_key from public.private_room_invites i join public.rooms r on r.id = i.room_id
          where i.code = payload->>'code' and r.owner_id is not null;
        if room_key is null then return jsonb_build_object('error','invalidInvite'); end if;
        perform pg_advisory_xact_lock(hashtextextended('room:' || room_key, 0));
        if not exists (select 1 from public.rooms where id = room_key and owner_id is not null) then
          return jsonb_build_object('error','invalidInvite');
        end if;
      when 'openBox','openChest' then
        if action = 'openChest' then
          select * into chest from public.room_chests where user_id = actor and not opened order by milestone, room_id limit 1 for update;
          if not found then return jsonb_build_object('error','noChest'); end if;
        end if;
        select i.id into rare_item from public.items i
          where i.kind = 'rare' and not exists (select 1 from public.user_items u where u.user_id = actor and u.item = i.id)
          order by gen_random_uuid() limit 1;
        if action = 'openBox' then
          if rare_item is null then return jsonb_build_object('error','collectionComplete'); end if;
          update public.profiles set coins = coins - 50 where id = actor and coins >= 50;
          if not found then return jsonb_build_object('error','insufficientCoins'); end if;
          insert into public.coin_ledger values('box:' || gen_random_uuid(), actor, -50);
        else
          update public.room_chests set opened = true where room_id = chest.room_id and milestone = chest.milestone and user_id = actor;
        end if;
        if rare_item is null then
          update public.profiles set coins = coins + 10 where id = actor;
          insert into public.coin_ledger values('chest:' || gen_random_uuid(), actor, 10);
          drop_info := jsonb_build_object('coins',10);
        else
          insert into public.user_items(user_id,item) values(actor,rare_item);
          drop_info := jsonb_build_object('item',rare_item);
        end if;
      when 'abandon' then
        update public.sessions set state = 'invalid' where user_id = actor and state = 'active';
        if not found then return jsonb_build_object('error','noSession'); end if;
      else null;
    end case;

    next_snapshot := public.library_core_action(actor,
      case when room_key is null then 'state' else 'join' end, jsonb_build_object('room',room_key));
    if next_snapshot ? 'error' then return next_snapshot; end if;
    if action = 'joinCode' then
      insert into public.private_room_access values(room_key, actor) on conflict do nothing;
    end if;
    snapshot := next_snapshot || jsonb_build_object('awarded',snapshot->'awarded');
  end if;

  now_ms := (snapshot->>'now')::bigint;
  room_key := snapshot#>>'{profile,room}';
  if exists (select 1 from public.rooms r where r.id = room_key and r.is_private and r.owner_id is null) then
    delete from public.room_members where user_id = actor and room = room_key;
    snapshot := jsonb_set(snapshot, '{profile}', (snapshot->'profile') || jsonb_build_object('room',null,'status',null));
    room_key := null;
  end if;
  return snapshot || jsonb_build_object(
    'profile', case when jsonb_typeof(snapshot->'profile') = 'null' then null else
      (snapshot->'profile') || jsonb_build_object('target',(select target from public.profiles where id = actor)) end,
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.name,'name_en',r.name_en,'capacity',r.capacity,'private',r.is_private,
      'count',stats.present,'targets',stats.targets,'minutes',coalesce(progress.minutes,0),
      'invite',case when r.owner_id = actor then (select code from public.private_room_invites where room_id = r.id) end
      ) order by r.is_private,r.name),'[]')
      from public.rooms r left join public.room_progress progress on progress.room_id = r.id
      cross join lateral (select count(*) present,
        coalesce(jsonb_agg(distinct p.target) filter (where p.target <> ''),'[]') targets
        from public.room_members m join public.profiles p on p.id = m.user_id
        where m.room = r.id and m.seen > now_ms - 15000) stats
      where not r.is_private or (r.owner_id is not null and exists (
        select 1 from public.private_room_access a where a.room_id = r.id and a.user_id = actor))),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
      'own',m.user_id = actor,'name',p.name,'target',p.target,'status',m.status,'avatar',to_jsonb(a) - 'user_id',
      'pet',case when pet.user_id is not null then jsonb_build_object('xp',pet.xp,'upset',pet.upset) end,
      'placed',(select coalesce(jsonb_agg(u.item order by u.item),'[]') from public.user_items u
        where u.user_id = m.user_id and u.placed)
      ) order by m.since,m.user_id),'[]')
      from public.room_members m join public.profiles p on p.id = m.user_id
      join public.avatars a on a.user_id = m.user_id left join public.pets pet on pet.user_id = m.user_id
      where m.room = room_key and m.seen > now_ms - 15000),
    'pet',(select jsonb_build_object('xp',xp,'upset',upset) from public.pets where user_id = actor),
    'chests',(select count(*) from public.room_chests where user_id = actor and not opened),
    'drop',drop_info
  );
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
