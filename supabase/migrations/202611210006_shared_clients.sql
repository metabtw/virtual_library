alter table public.sessions add column next_check_at bigint generated always as (
  case
    when state <> 'active' then null
    when verification_due < end_ms then verification_due
    when paused_at is null and start_ms + (checks + 1) * 1200000::bigint < end_ms
      then start_ms + (checks + 1) * 1200000::bigint
  end
) stored;

alter table public.profiles add column leaderboard_visible boolean not null default false;
create index completed_focus_by_date on public.sessions (end_ms, user_id) include (start_ms) where state = 'completed';
create index completed_focus_by_user on public.sessions (user_id, end_ms) include (start_ms) where state = 'completed';

alter table public.room_members add column desk_ref uuid not null default gen_random_uuid() unique;

create function public.rotate_desk_ref()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.desk_ref := gen_random_uuid();
  return new;
end;
$$;
revoke all on function public.rotate_desk_ref() from public, anon, authenticated;
create trigger rotate_desk_ref before update of room on public.room_members
  for each row when (old.room is distinct from new.room) execute function public.rotate_desk_ref();

-- Only the most recent reaction per sender is stored, so the feed stays bounded.
create table public.desk_reactions (
  from_user uuid primary key references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  room_id text not null references public.rooms(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  kind text not null check (kind in ('coffee','clap')),
  created_ms bigint not null,
  check (from_user <> to_user)
);
create index current_desk_reactions on public.desk_reactions(to_user, room_id, created_ms desc);
alter table public.desk_reactions enable row level security;
revoke all on public.desk_reactions from anon, authenticated;

alter function public.library_action(uuid, text, jsonb) rename to library_club_action;
revoke all on function public.library_club_action(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
  room_key text;
  observed bigint;
  recipient uuid;
  kind text;
  upcoming bigint;
  current_day date := (clock_timestamp() at time zone 'Europe/Istanbul')::date;
  starts date;
  starts_ms bigint;
  ends_ms bigint;
  output jsonb;
begin
  if action in ('studySummary','leaderboard') then
    if not exists (select 1 from public.profiles where id = actor) then
      return jsonb_build_object('error','profileRequired');
    end if;
    starts := case when action = 'leaderboard' then date_trunc('week', current_day::timestamp)::date else current_day end;
    starts_ms := (extract(epoch from (starts::timestamp at time zone 'Europe/Istanbul')) * 1000)::bigint;
    ends_ms := (extract(epoch from ((starts + case when action = 'leaderboard' then 7 else 1 end)::timestamp
      at time zone 'Europe/Istanbul')) * 1000)::bigint;
  end if;

  if action = 'studySummary' then
    with days as (
      select distinct (to_timestamp(end_ms / 1000.0) at time zone 'Europe/Istanbul')::date as day
      from public.sessions where user_id = actor and state = 'completed' and end_ms < ends_ms
    ), streak as (
      select day, row_number() over (order by day desc) as position, max(day) over () as latest
      from days
    )
    select jsonb_build_object('date', current_day,
      'minutes', (select coalesce(sum((end_ms - start_ms) / 60000),0) from public.sessions
        where user_id = actor and state = 'completed' and end_ms >= starts_ms and end_ms < ends_ms),
      'streak', (select count(*) from streak where day =
        (case when latest = current_day then current_day else current_day - 1 end) - (position - 1)::int)
    ) into output;
    return output;
  end if;

  if action = 'leaderboard' then
    with totals as (
      select p.id, p.name, sum((s.end_ms - s.start_ms) / 60000) as minutes
      from public.sessions s join public.profiles p on p.id = s.user_id
      where p.leaderboard_visible and s.state = 'completed' and s.end_ms >= starts_ms and s.end_ms < ends_ms
      group by p.id, p.name
    ), ranked as (
      select id, name, minutes, rank() over (order by minutes desc) as rank from totals
    )
    select jsonb_build_object('starts', starts, 'ends', starts + 6,
      'visible', (select leaderboard_visible from public.profiles where id = actor),
      'own', (select jsonb_build_object('rank',rank,'minutes',minutes) from ranked where id = actor),
      'rows', (select coalesce(jsonb_agg(to_jsonb(r) - 'id' order by rank, name, id),'[]')
        from (select * from ranked order by rank, name, id limit 20) r)
    ) into output;
    return output;
  end if;

  -- The existing path settles the user's period, applies the focus lock and updates Presence.
  snapshot := public.library_club_action(actor,
    case when action in ('react','rankingVisibility') then 'state' else action end, payload);
  if snapshot ? 'error' then return snapshot; end if;
  room_key := snapshot#>>'{profile,room}';
  observed := (snapshot->>'now')::bigint;

  if action in ('react','rankingVisibility') then
    if jsonb_typeof(snapshot->'profile') = 'null' then return jsonb_build_object('error','profileRequired'); end if;
    if snapshot#>>'{session,state}' = 'active' and snapshot#>>'{session,paused_at}' is null then
      return jsonb_build_object('error','working');
    end if;
  end if;

  if action = 'rankingVisibility' then
    if jsonb_typeof(payload->'visible') is distinct from 'boolean' then
      return jsonb_build_object('error','invalidRanking');
    end if;
    update public.profiles set leaderboard_visible = (payload->>'visible')::boolean where id = actor;
  elsif action = 'react' then
    kind := payload->>'kind';
    if kind is null or kind not in ('coffee','clap') then return jsonb_build_object('error','invalidReaction'); end if;
    select m.user_id into recipient from public.room_members m
      where m.room = room_key and m.desk_ref::text = payload->>'desk'
        and m.user_id <> actor and m.seen > observed - 15000;
    if recipient is null then return jsonb_build_object('error','reactionUnavailable'); end if;
    insert into public.desk_reactions(from_user,to_user,room_id,kind,created_ms)
      values(actor,recipient,room_key,kind,observed)
      on conflict (from_user) do update set to_user = excluded.to_user, room_id = excluded.room_id,
        kind = excluded.kind, created_ms = excluded.created_ms, id = gen_random_uuid()
      where public.desk_reactions.created_ms <= excluded.created_ms - 4000;
    if not found then return jsonb_build_object('error','reactionSlowDown'); end if;
  end if;

  if snapshot#>>'{session,state}' = 'active' then
    select next_check_at into upcoming from public.sessions where user_id = actor and state = 'active';
    snapshot := jsonb_set(snapshot, '{session}', (snapshot->'session') ||
      jsonb_build_object('next_check_at',upcoming,'check_until',upcoming + 30000));
  end if;
  if room_key is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'own', m.user_id = actor, 'desk_ref', m.desk_ref, 'name', p.name, 'target', p.target,
      'status', m.status, 'avatar', to_jsonb(a) - 'user_id',
      'pet', case when pet.user_id is not null then jsonb_build_object('xp',pet.xp,'upset',pet.upset) end,
      'placed', (select coalesce(jsonb_agg(u.item order by u.item),'[]') from public.user_items u
        where u.user_id = m.user_id and u.placed)
      ) order by m.since,m.user_id),'[]')
    into output
    from public.room_members m join public.profiles p on p.id = m.user_id
      join public.avatars a on a.user_id = m.user_id left join public.pets pet on pet.user_id = m.user_id
    where m.room = room_key and m.seen > observed - 15000;
    snapshot := jsonb_set(snapshot, '{members}', output);
  end if;

  return snapshot || jsonb_build_object('reactions',
    (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'name',p.name) order by r.created_ms),'[]')
      from (select * from public.desk_reactions where to_user = actor and room_id = room_key
        and created_ms > observed - 12000 order by created_ms desc limit 8) r
      join public.profiles p on p.id = r.from_user));
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
