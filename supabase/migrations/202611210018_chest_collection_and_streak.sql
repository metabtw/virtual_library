insert into public.items (id, name, name_en, price, kind)
values ('shore', 'Kıyı Dalgaları', 'Shore Waves', 30, 'ambience');

alter table public.items add column box_only boolean not null default false;
update public.items set box_only = true where id not in (
  'lamp', 'plant', 'deskCalendar',
  'midnightFade', 'mintBob', 'shortWaves',
  'sweater', 'linenShirt', 'denimJacket',
  'cat', 'pinkRabbit', 'yellowChick',
  'space', 'forest', 'shore'
);

update public.study_boxes
set price = case tier when 'basic' then 75 when 'epic' then 140 when 'legendary' then 230 end
where tier in ('basic', 'epic', 'legendary');
delete from public.study_box_rewards;
insert into public.study_box_rewards values
  ('epic', 'arcticFox', 15),
  ('epic', 'neon', 14),
  ('epic', 'moonstoneLamp', 13),
  ('epic', 'rainbowPrism', 12),
  ('epic', 'moonCoat', 11),
  ('epic', 'lavenderBuns', 10),
  ('epic', 'starlightJacket', 9),
  ('epic', 'jellyTank', 7),
  ('epic', 'recordPlayer', 5),
  ('epic', 'curlyFringe', 4),
  ('legendary', 'moonGlobe', 30),
  ('legendary', 'goldKeys', 25),
  ('legendary', 'highPonytail', 20),
  ('legendary', 'clockworkOwl', 15),
  ('legendary', 'dragon', 10);

insert into public.study_box_rewards (tier, item, weight)
  select 'basic', item.id, case
    when item.id in ('zenGarden', 'crystalTerrarium', 'retroRadio', 'pugPup', 'silverBraid', 'auroraHood') then 2
    when item.id in ('foxMug', 'teaSet', 'origamiCrane', 'hourglass') then 7
    else case when item.kind = 'desk' then 6 else 4 end
  end
  from public.items item
  where item.box_only and not exists (select 1 from public.study_box_rewards reward where reward.item = item.id);

create or replace function public.weekly_focus_quests(actor uuid, week_start date)
returns jsonb language plpgsql set search_path = '' as $$
declare
  minutes integer;
  active_days integer;
  longest_streak integer;
  event_id text;
  goal record;
  progress integer;
  goals jsonb := '[]';
begin
  with activity as (
    select (to_timestamp(s.end_ms / 1000.0) at time zone 'Europe/Istanbul')::date as day,
      sum((s.end_ms - s.start_ms) / 60000) as minutes
    from public.sessions s
    where s.user_id = actor and s.state = 'completed'
      and s.end_ms >= extract(epoch from (week_start::timestamp at time zone 'Europe/Istanbul')) * 1000
      and s.end_ms < extract(epoch from ((week_start + 7)::timestamp at time zone 'Europe/Istanbul')) * 1000
    group by 1
  ), streak_days as (
    select day - (row_number() over (order by day))::int as streak_start
    from activity where activity.minutes >= 30
  ), streaks as (
    select count(*) as days from streak_days group by streak_start
  )
  select coalesce(sum(activity.minutes), 0)::int, count(*) filter (where activity.minutes >= 30)::int,
    coalesce((select max(days) from streaks), 0)::int
  into minutes, active_days, longest_streak from activity;

  for goal in select * from (values ('focus-300', 300, 15, 'minutes'), ('focus-600', 600, 30, 'minutes'),
    ('regular-4', 4, 15, 'days'), ('streak-7', 7, 45, 'days')) as targets(id, target, coins, unit)
  loop
    progress := case when goal.id = 'streak-7' then longest_streak
      when goal.unit = 'days' then active_days else minutes end;
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

alter function public.library_action(uuid, text, jsonb) rename to library_before_chest_collection;
revoke all on function public.library_before_chest_collection(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if action = 'buy' and exists (
    select 1 from public.items where id = payload->>'item' and box_only
  ) then
    return jsonb_build_object('error', 'boxOnly');
  end if;
  if action = 'openBox' and payload ? 'price' and exists (
    select 1 from public.study_boxes where tier = coalesce(payload->>'tier', 'basic')
      and to_jsonb(price) is distinct from payload->'price'
  ) then
    return jsonb_build_object('error', 'boxPriceChanged');
  end if;
  return public.library_before_chest_collection(actor, action, payload);
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
