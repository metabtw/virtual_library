alter table public.profiles add column do_not_disturb boolean not null default false;
alter table public.profiles add column interactions_since_ms bigint not null default 0;

-- Existing ledger entries stay historical, so updating the app does not replay them as new rewards.
alter table public.coin_ledger add column credited_at timestamptz;
alter table public.coin_ledger alter column credited_at set default clock_timestamp();
create index recent_coin_awards on public.coin_ledger(user_id, credited_at desc)
  where amount > 0 and credited_at is not null;

create function public.add_referral_friendship()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.inviter is not null then
    insert into public.reader_friendships (reader_a, reader_b, requested_by, accepted)
    values (least(new.referred, new.inviter), greatest(new.referred, new.inviter), new.inviter, true)
    on conflict (reader_a, reader_b) do update set accepted = true;
  end if;
  return new;
end;
$$;
revoke all on function public.add_referral_friendship() from public, anon, authenticated, service_role;
create trigger add_referral_friendship after insert on public.reader_referrals
  for each row execute function public.add_referral_friendship();

create table public.desk_coffee_cups (
  recipient uuid primary key references public.profiles(id) on delete cascade,
  sender uuid not null references public.profiles(id) on delete cascade,
  desk uuid not null,
  event uuid not null,
  arrived_ms bigint not null
);
alter table public.desk_coffee_cups enable row level security;
revoke all on public.desk_coffee_cups from public, anon, authenticated;

create function public.place_reaction_coffee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind = 'coffee' then
    insert into public.desk_coffee_cups (recipient, sender, desk, event, arrived_ms)
    select new.to_user, new.from_user, member.desk_ref, new.id, new.created_ms
    from public.room_members member where member.user_id = new.to_user and member.room = new.room_id
    on conflict (recipient) do update set
      sender = excluded.sender, desk = excluded.desk, event = excluded.event, arrived_ms = excluded.arrived_ms
    where public.desk_coffee_cups.arrived_ms <= excluded.arrived_ms;
  end if;
  return new;
end;
$$;
revoke all on function public.place_reaction_coffee() from public, anon, authenticated, service_role;
create trigger place_reaction_coffee after insert or update on public.desk_reactions
  for each row execute function public.place_reaction_coffee();

create function public.accepts_reader_interaction(recipient uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  -- This lock is separate from actor locks, so two readers can send to each other concurrently.
  perform pg_advisory_xact_lock(hashtextextended('social-inbox:' || recipient::text, 0));
  return coalesce((select not p.do_not_disturb from public.profiles p where p.id = recipient), false);
end;
$$;
revoke all on function public.accepts_reader_interaction(uuid) from public, anon, authenticated, service_role;

alter function public.library_action(uuid, text, jsonb) rename to library_before_social_interactions;
revoke all on function public.library_before_social_interactions(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
  quiet boolean;
  interactions_since bigint;
  observed bigint;
  other_reader uuid;
  other_code text;
  member_views jsonb;
  room_is_public boolean;
begin
  if action in ('react', 'addDeskFriend', 'setDoNotDisturb') then
    perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
  end if;
  if action in ('react', 'addDeskFriend') then
    observed := public.library_time_ms();
    select peer.user_id, p.reader_code, not room.is_private into other_reader, other_code, room_is_public
    from public.room_members own_desk
    join public.room_members peer on peer.room = own_desk.room and peer.user_id <> actor
    join public.profiles p on p.id = peer.user_id
    join public.rooms room on room.id = own_desk.room
    where own_desk.user_id = actor and (action = 'react' or own_desk.seen > observed - 15000)
      and (action = 'react' or peer.seen > observed - 15000) and peer.desk_ref::text = payload->>'desk';

    if action = 'addDeskFriend' then
      if other_reader is null or not room_is_public then return jsonb_build_object('error', 'deskFriendUnavailable'); end if;
      action := 'addFriend';
      payload := payload || jsonb_build_object('code', other_code);
    elsif other_reader is not null and not public.accepts_reader_interaction(other_reader) then
      return jsonb_build_object('error', 'interactionUnavailable');
    end if;
  elsif action = 'setDoNotDisturb' then
    if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then
      return jsonb_build_object('error', 'invalidInteractionSetting');
    end if;
    perform pg_advisory_xact_lock(hashtextextended('social-inbox:' || actor::text, 0));
    quiet := (payload->>'enabled')::boolean;
    update public.profiles set do_not_disturb = quiet, interactions_since_ms = public.library_time_ms()
      where id = actor and do_not_disturb is distinct from quiet;
    if not found and not exists(select 1 from public.profiles where id = actor) then
      return jsonb_build_object('error', 'profileRequired');
    end if;
    action := 'state';
  end if;

  snapshot := public.library_before_social_interactions(actor, action, payload);
  if snapshot ? 'error' or jsonb_typeof(snapshot->'profile') is distinct from 'object' then return snapshot; end if;
  observed := (snapshot->>'now')::bigint;
  select p.do_not_disturb, p.interactions_since_ms into quiet, interactions_since
    from public.profiles p where p.id = actor;

  select coalesce(jsonb_agg(entry || jsonb_build_object(
      'acceptsInteractions', not p.do_not_disturb,
      'friendStatus', case when f.accepted then 'accepted' when f.requested_by = actor then 'sent'
        when f.id is not null and not quiet then 'incoming' end,
      'coffeeCup', case when cup.event is not null then jsonb_build_object('id', cup.event, 'expiresAt', cup.arrived_ms + 12000) end
    ) order by position), '[]')
  into member_views
  from jsonb_array_elements(snapshot->'members') with ordinality as members(entry, position)
  join public.room_members desk on desk.desk_ref = (entry->>'desk_ref')::uuid
  join public.profiles p on p.id = desk.user_id
  left join public.reader_friendships f on f.reader_a = least(actor, desk.user_id) and f.reader_b = greatest(actor, desk.user_id)
  left join public.desk_coffee_cups cup on cup.recipient = desk.user_id and cup.desk = desk.desk_ref
    and actor in (cup.sender, cup.recipient) and not p.do_not_disturb
    and cup.arrived_ms >= p.interactions_since_ms and cup.arrived_ms > observed - 12000;

  return snapshot || jsonb_build_object(
    'profile', (snapshot->'profile') || jsonb_build_object('doNotDisturb', quiet),
    'members', member_views,
    'friends', (select coalesce(jsonb_agg(friend order by position), '[]')
      from jsonb_array_elements(snapshot->'friends') with ordinality as friends(friend, position)
      where not quiet or friend->>'status' <> 'incoming'),
    'reactions', (select coalesce(jsonb_agg(reaction order by position), '[]')
      from jsonb_array_elements(snapshot->'reactions') with ordinality as reactions(reaction, position)
      join public.desk_reactions r on r.id = (reaction->>'id')::uuid
      where not quiet and r.created_ms >= interactions_since),
    'coinAwards', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', md5(entry.reference),
      'amount', entry.amount,
      'reason', case
        when entry.reference like 'welcome:%' then 'welcome'
        when entry.reference like 'daily:%' then 'daily'
        when entry.reference like 'weekly:%' then 'weekly'
        when entry.reference like 'referral:reader:%' then 'referred'
        when entry.reference like 'referral:inviter:%' then 'referral'
        when entry.reference like 'rewarded-ad:%' then 'ad'
        when entry.reference like 'chest:%' then 'chest'
        else 'focus' end
      ) order by entry.credited_at, entry.reference), '[]')
      from (select reference, amount, credited_at from public.coin_ledger
        where user_id = actor and amount > 0 and credited_at >= to_timestamp(observed / 1000.0) - interval '15 minutes'
        order by credited_at desc, reference desc limit 24) entry)
  );
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
