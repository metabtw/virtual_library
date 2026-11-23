insert into public.rooms (id, name, name_en) values
  ('rain-terrace', 'Yağmur Terası', 'Rain Terrace'),
  ('aurora-observatory', 'Kuzey Işıkları Gözlemevi', 'Northern Lights Observatory'),
  ('japanese-garden', 'Japon Bahçesi', 'Japanese Garden');

insert into public.items (id, name, name_en, price, kind, equip_slot) values
  ('twinBraids', 'Çift Örgü', 'Twin Braids', 22, 'hair', 'hair'),
  ('shortWaves', 'Dalgalı Kısa Saç', 'Short Waves', 24, 'hair', 'hair'),
  ('sideSwept', 'Yandan Ayrık Saç', 'Side-Swept Hair', 22, 'hair', 'hair'),
  ('highPonytail', 'Yüksek Atkuyruğu', 'High Ponytail', 28, 'hair', 'hair'),
  ('curlyFringe', 'Kıvırcık Perçem', 'Curly Fringe', 26, 'hair', 'hair'),
  ('denimJacket', 'Kot Ceket', 'Denim Jacket', 28, 'wearable', 'outfit'),
  ('stripedCardigan', 'Çizgili Hırka', 'Striped Cardigan', 26, 'wearable', 'outfit'),
  ('linenShirt', 'Keten Gömlek', 'Linen Shirt', 24, 'wearable', 'outfit'),
  ('raincoat', 'Yağmurluk', 'Raincoat', 30, 'wearable', 'outfit'),
  ('boatNeckSweater', 'Kayık Yaka Kazak', 'Boatneck Sweater', 28, 'wearable', 'outfit'),
  ('brassLamp', 'Pirinç Okuma Lambası', 'Brass Reading Lamp', 30, 'desk', 'light'),
  ('deskCalendar', 'Masa Takvimi', 'Desk Calendar', 18, 'desk', 'table_accent'),
  ('pottedCactus', 'Kaktüs Saksısı', 'Potted Cactus', 22, 'desk', 'table_display'),
  ('recordPlayer', 'Vinil Çalar', 'Record Player', 34, 'desk', 'table_accent'),
  ('zenGarden', 'Masaüstü Zen Bahçesi', 'Desktop Zen Garden', 32, 'desk', 'table_display'),
  ('moonstoneLamp', 'Aytaşı Lamba', 'Moonstone Lamp', 50, 'rare', 'light'),
  ('rainbowPrism', 'Gökkuşağı Prizması', 'Rainbow Prism', 50, 'rare', 'table_display'),
  ('moonGlobe', 'Minyatür Ay Küresi', 'Mini Moon Globe', 50, 'rare', 'table_display'),
  ('arcticFox', 'Kutup Tilkisi', 'Arctic Fox', 50, 'rare', 'pet'),
  ('clockworkOwl', 'Mekanik Baykuş', 'Clockwork Owl', 50, 'rare', 'table_display');

create table public.study_boxes (
  tier text primary key,
  price integer not null check (price > 0),
  position integer not null unique
);
create table public.study_box_rewards (
  tier text not null references public.study_boxes(tier),
  item text not null unique references public.items(id),
  weight integer not null check (weight > 0),
  primary key (tier, item)
);
alter table public.study_boxes enable row level security;
alter table public.study_box_rewards enable row level security;
revoke all on public.study_boxes, public.study_box_rewards from public, anon, authenticated;

insert into public.study_boxes values ('basic', 50, 1), ('epic', 85, 2), ('legendary', 130, 3);
insert into public.study_box_rewards values
  ('basic', 'goldKeys', 55), ('basic', 'moonstoneLamp', 30), ('basic', 'neon', 15),
  ('epic', 'rainbowPrism', 55), ('epic', 'moonGlobe', 35), ('epic', 'arcticFox', 10),
  ('legendary', 'dragon', 70), ('legendary', 'clockworkOwl', 30);

create or replace function public.daily_focus_quests(actor uuid, today date)
returns jsonb language plpgsql set search_path = '' as $$
declare
  minutes integer;
  goal record;
  goals jsonb := '[]';
  event_id text;
  claimed boolean;
begin
  select coalesce(sum((s.end_ms - s.start_ms) / 60000), 0)::int into minutes
  from public.sessions s
  where s.user_id = actor and s.state = 'completed'
    and s.end_ms >= extract(epoch from (today::timestamp at time zone 'Europe/Istanbul')) * 1000
    and s.end_ms < extract(epoch from ((today + 1)::timestamp at time zone 'Europe/Istanbul')) * 1000;

  -- Keep the original ledger references so a daily reward already paid stays claimed until midnight.
  for goal in select * from (values (60, 5, 30), (120, 10, 60)) as targets(minutes, coins, previous_target)
  loop
    event_id := format('daily:%s:%s:%s', actor, today, goal.previous_target);
    claimed := exists (select 1 from public.coin_ledger where reference = event_id);
    if minutes >= goal.minutes and not claimed then
      perform public.grant_study_coins(actor, event_id, goal.coins);
    end if;
    goals := goals || jsonb_build_array(jsonb_build_object('minutes', goal.minutes, 'coins', goal.coins,
      'completed', claimed or minutes >= goal.minutes));
  end loop;
  return jsonb_build_object('date', today, 'minutes', minutes, 'goals', goals);
end;
$$;

create function public.weekly_focus_quests(actor uuid, week_start date)
returns jsonb language plpgsql set search_path = '' as $$
declare
  minutes integer;
  active_days integer;
  event_id text;
  goal record;
  progress integer;
  goals jsonb := '[]';
begin
  select coalesce(sum(activity.minutes), 0)::int, count(*) filter (where activity.minutes >= 30)::int
    into minutes, active_days
  from (
    select sum((s.end_ms - s.start_ms) / 60000) as minutes
    from public.sessions s
    where s.user_id = actor and s.state = 'completed'
      and s.end_ms >= extract(epoch from (week_start::timestamp at time zone 'Europe/Istanbul')) * 1000
      and s.end_ms < extract(epoch from ((week_start + 7)::timestamp at time zone 'Europe/Istanbul')) * 1000
    group by (to_timestamp(s.end_ms / 1000.0) at time zone 'Europe/Istanbul')::date
  ) as activity;

  for goal in select * from (values ('focus-300', 300, 15, 'minutes'), ('focus-600', 600, 30, 'minutes'),
    ('regular-4', 4, 15, 'days')) as targets(id, target, coins, unit)
  loop
    progress := case when goal.unit = 'minutes' then minutes else active_days end;
    if progress >= goal.target then
      event_id := format('weekly:%s:%s:%s', actor, week_start, goal.id);
      if not exists (select 1 from public.coin_ledger where reference = event_id) then
        perform public.grant_study_coins(actor, event_id, goal.coins);
      end if;
    end if;
    goals := goals || jsonb_build_array(jsonb_build_object('id', goal.id, 'target', goal.target,
      'progress', progress, 'coins', goal.coins, 'unit', goal.unit, 'completed', progress >= goal.target));
  end loop;
  return jsonb_build_object('start', week_start, 'end', week_start + 7, 'goals', goals);
end;
$$;
revoke all on function public.weekly_focus_quests(uuid, date) from public, anon, authenticated;

create or replace function public.credit_daily_focus()
returns trigger language plpgsql set search_path = '' as $$
declare
  completed_local timestamp := to_timestamp(new.end_ms / 1000.0) at time zone 'Europe/Istanbul';
begin
  perform public.daily_focus_quests(new.user_id, completed_local::date);
  perform public.weekly_focus_quests(new.user_id, date_trunc('week', completed_local)::date);
  return new;
end;
$$;

create function public.open_study_box(actor uuid, chosen_tier text, room_chest boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  box_price integer;
  prize text;
  chest public.room_chests;
begin
  select price into box_price from public.study_boxes where tier = chosen_tier;
  if not found then return jsonb_build_object('error', 'invalidBox'); end if;

  if room_chest then
    select * into chest from public.room_chests where user_id = actor and not opened
      order by milestone, room_id limit 1 for update;
    if not found then return jsonb_build_object('error', 'noChest'); end if;
  end if;

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
    return jsonb_build_object('coins', 10);
  end if;
  insert into public.user_items (user_id, item) values (actor, prize);
  return jsonb_build_object('item', prize);
end;
$$;
revoke all on function public.open_study_box(uuid, text, boolean) from public, anon, authenticated, service_role;

alter function public.library_action(uuid, text, jsonb) rename to library_before_study_goals;
revoke all on function public.library_before_study_goals(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  opens_box boolean := action in ('openBox', 'openChest');
  tier jsonb := coalesce(payload->'tier', '"basic"'::jsonb);
  snapshot jsonb;
  reward jsonb;
  weekly jsonb;
begin
  snapshot := public.library_before_study_goals(actor, case when opens_box then 'state' else action end, payload);
  if snapshot ? 'error' then return snapshot; end if;
  if snapshot->>'profile' is null then
    if opens_box then return jsonb_build_object('error', 'profileRequired'); end if;
    return snapshot;
  end if;

  weekly := public.weekly_focus_quests(actor, date_trunc('week', clock_timestamp() at time zone 'Europe/Istanbul')::date);
  if opens_box then
    if snapshot#>>'{session,state}' = 'active' and snapshot#>>'{session,paused_at}' is null then
      return jsonb_build_object('error', 'working');
    end if;
    if action = 'openBox' and jsonb_typeof(tier) <> 'string' then return jsonb_build_object('error', 'invalidBox'); end if;
    reward := public.open_study_box(actor, case when action = 'openChest' then 'basic' else tier#>>'{}' end, action = 'openChest');
    if reward ? 'error' then return reward; end if;
    snapshot := public.library_before_study_goals(actor, 'state', payload)
      || jsonb_build_object('awarded', snapshot->'awarded', 'drop', reward);
  end if;

  return jsonb_set(snapshot, '{profile,coins}', to_jsonb((select coins from public.profiles where id = actor)))
    || jsonb_build_object('weeklyQuests', weekly, 'boxes', (
      select jsonb_agg(jsonb_build_object('id', box.tier, 'price', box.price, 'rewards', (
        select jsonb_agg(jsonb_build_object('item', reward.item, 'weight', reward.weight)
          order by reward.weight desc, reward.item)
        from public.study_box_rewards reward where reward.tier = box.tier
      )) order by box.position) from public.study_boxes box
    ));
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
