-- Base style indexes stay readable by older clients while the new options
-- travel alongside them in the same profile and room snapshots.
alter table public.avatars
  add column hair_style smallint check (hair_style between 3 and 6),
  add column outfit_style smallint check (outfit_style between 3 and 5),
  add column skin_tone smallint not null default 0 check (skin_tone between 0 and 4),
  add column hair_color smallint not null default 0 check (hair_color between 0 and 4),
  add column beard smallint not null default 0 check (beard between 0 and 2);

alter table public.items drop constraint items_kind_check, drop constraint items_equip_slot_check;
alter table public.items add constraint items_kind_check
  check (kind in ('desk', 'wearable', 'hair', 'ambience', 'rare', 'pet'));
alter table public.items add constraint items_equip_slot_check
  check (equip_slot in ('outfit', 'hair', 'light', 'table_accent', 'table_display', 'pet'));

update public.items set kind = 'pet', equip_slot = 'pet' where id = 'cat';
update public.items set equip_slot = 'pet' where id = 'dragon';
update public.items set equip_slot = 'table_accent' where id = 'goldKeys';

-- The existing placement trigger allows one owned item in each slot.
-- Every tabletop decoration occupies one of three slots. Pets have their own.
alter table public.items add constraint items_kind_slot_check check (
  (kind = 'ambience' and equip_slot is null) or (equip_slot is not null and (
    (kind = 'wearable' and equip_slot = 'outfit') or
    (kind = 'hair' and equip_slot = 'hair') or
    (kind = 'pet' and equip_slot = 'pet') or
    (kind = 'desk' and equip_slot in ('light', 'table_accent', 'table_display')) or
    (kind = 'rare' and equip_slot in ('light', 'table_accent', 'table_display', 'pet'))
  ))
);

-- Preserve occupied slots and the cat when repairing the extra placements
-- created before the keyboard and dragon had a slot. All items stay owned.
with overlapping as (
  select owned.user_id, owned.item, row_number() over (
    partition by owned.user_id, item.equip_slot
    order by (item.id in ('goldKeys', 'dragon')), item.id
  ) as position
  from public.user_items owned
  join public.items item on item.id = owned.item
  where owned.placed and item.equip_slot is not null
)
update public.user_items owned set placed = false
from overlapping
where overlapping.position > 1 and (owned.user_id, owned.item) = (overlapping.user_id, overlapping.item);

insert into public.items(id, name, name_en, price, kind, equip_slot) values
  ('pinkRabbit', 'Pembe Tavşan', 'Pink Rabbit', 24, 'pet', 'pet'),
  ('pugPup', 'Minik Pug', 'Pug Puppy', 28, 'pet', 'pet'),
  ('yellowChick', 'Sarı Civciv', 'Yellow Chick', 12, 'pet', 'pet');

create or replace function public.library_core_action(actor uuid, action text, payload jsonb default '{}')
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
