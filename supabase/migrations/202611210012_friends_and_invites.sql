alter table public.profiles
  add column reader_code text not null unique default ('SK-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 12))),
  add column referral_code text not null unique default ('DV-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 12)));

create table public.reader_referrals (
  referred uuid primary key references public.profiles(id) on delete cascade,
  inviter uuid references public.profiles(id) on delete set null,
  id uuid not null unique default gen_random_uuid(),
  check (referred <> inviter)
);
create index reader_referrals_inviter on public.reader_referrals(inviter);

create table public.reader_friendships (
  id uuid primary key default gen_random_uuid(),
  reader_a uuid not null references public.profiles(id) on delete cascade,
  reader_b uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null check (requested_by in (reader_a, reader_b)),
  accepted boolean not null default false,
  unique (reader_a, reader_b),
  check (reader_a < reader_b)
);
create index reader_friendships_reader_b on public.reader_friendships(reader_b);

create table public.study_invites (
  id uuid primary key default gen_random_uuid(),
  friendship uuid not null references public.reader_friendships(id) on delete cascade,
  sender uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  room text not null references public.rooms(id) on delete cascade,
  expires_at timestamptz not null default (clock_timestamp() + interval '30 minutes'),
  unique (friendship, sender),
  check (sender <> recipient)
);
create index study_invites_recipient on public.study_invites(recipient);
create index study_invites_sender on public.study_invites(sender);
create index study_invites_room on public.study_invites(room);

alter table public.reader_referrals enable row level security;
alter table public.reader_friendships enable row level security;
alter table public.study_invites enable row level security;
revoke all on public.reader_referrals, public.reader_friendships, public.study_invites from anon, authenticated;

alter function public.library_action(uuid, text, jsonb) rename to library_shared_action;
revoke all on function public.library_shared_action(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.reader_social_action(actor uuid, action text, payload jsonb, current_room text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  other_reader uuid;
  friendship public.reader_friendships;
  invitation public.study_invites;
  joined jsonb;
  access_added boolean := false;
  private_room boolean;
begin
  if action = 'addFriend' then
    select p.id into other_reader from public.profiles p where p.reader_code = upper(trim(payload->>'code')) and p.id <> actor;
    if other_reader is null then return jsonb_build_object('error', 'friendMissing'); end if;
    insert into public.reader_friendships(reader_a, reader_b, requested_by)
      values (least(actor, other_reader), greatest(actor, other_reader), actor) on conflict (reader_a, reader_b) do nothing;
    return null;
  end if;

  if action in ('answerFriend', 'removeFriend', 'inviteFriend') then
    select * into friendship from public.reader_friendships f
      where f.id::text = payload->>'id' and actor in (f.reader_a, f.reader_b) for update;
    if not found then return jsonb_build_object('error', 'friendMissing'); end if;
    if action = 'removeFriend' then
      delete from public.reader_friendships where id = friendship.id;
    elsif action = 'answerFriend' then
      if friendship.requested_by = actor or friendship.accepted then return jsonb_build_object('error', 'friendMissing'); end if;
      if payload->>'answer' = 'accept' then
        update public.reader_friendships set accepted = true where id = friendship.id;
      elsif payload->>'answer' = 'reject' then
        delete from public.reader_friendships where id = friendship.id;
      else
        return jsonb_build_object('error', 'friendMissing');
      end if;
    else
      if not friendship.accepted then return jsonb_build_object('error', 'friendMissing'); end if;
      if current_room is null then return jsonb_build_object('error', 'roomMissing'); end if;
      other_reader := case when actor = friendship.reader_a then friendship.reader_b else friendship.reader_a end;
      insert into public.study_invites(friendship, sender, recipient, room) values (friendship.id, actor, other_reader, current_room)
        on conflict on constraint study_invites_friendship_sender_key do update
          set room = excluded.room, expires_at = excluded.expires_at, id = excluded.id;
    end if;
    return null;
  end if;

  select * into invitation from public.study_invites i
    where i.id::text = payload->>'id' and i.recipient = actor and i.expires_at > clock_timestamp();
  if not found then return jsonb_build_object('error', 'studyInviteMissing'); end if;
  -- Lock both rows in the same order as sending an invitation or removing the friendship.
  perform 1 from public.reader_friendships where id = invitation.friendship and accepted for update;
  if not found then return jsonb_build_object('error', 'studyInviteMissing'); end if;
  select * into invitation from public.study_invites i
    where i.id = invitation.id and i.recipient = actor and i.expires_at > clock_timestamp() for update;
  if not found then return jsonb_build_object('error', 'studyInviteMissing'); end if;
  if payload->>'answer' = 'reject' then
    delete from public.study_invites where id = invitation.id;
    return null;
  end if;
  if coalesce(payload->>'answer', '') <> 'accept' then return jsonb_build_object('error', 'studyInviteMissing'); end if;

  perform pg_advisory_xact_lock(hashtextextended('room:' || invitation.room, 0));
  if not exists (select 1 from public.room_members m where m.room = invitation.room and m.user_id = invitation.sender
    and m.seen > extract(epoch from clock_timestamp()) * 1000 - 15000) then
    delete from public.study_invites where id = invitation.id;
    return jsonb_build_object('error', 'studyInviteMissing');
  end if;
  select r.is_private into private_room from public.rooms r
    where r.id = invitation.room and (not r.is_private or r.owner_id is not null);
  if not found then return jsonb_build_object('error', 'studyInviteMissing'); end if;
  if private_room then
    insert into public.private_room_access values (invitation.room, actor) on conflict do nothing;
    access_added := found;
  end if;
  joined := public.library_shared_action(actor, 'join', jsonb_build_object('room', invitation.room));
  if joined ? 'error' then
    if access_added then delete from public.private_room_access where room_id = invitation.room and user_id = actor; end if;
    return joined;
  end if;
  delete from public.study_invites where id = invitation.id;
  return joined || jsonb_build_object('joinedInvite', true);
end;
$$;
revoke all on function public.reader_social_action(uuid, text, jsonb, text) from public, anon, authenticated;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
  next_snapshot jsonb;
  profile public.profiles;
  inviter_id uuid;
  referral_id uuid;
  referral text := upper(trim(payload->>'referral'));
  social boolean := action in ('addFriend', 'answerFriend', 'removeFriend', 'inviteFriend', 'answerStudyInvite');
  quests jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
  if action = 'profile' and coalesce(referral, '') <> '' and not exists (select 1 from public.profiles where id = actor) then
    select p.id into inviter_id from public.profiles p where referral in (p.reader_code, p.referral_code) for key share;
    if inviter_id is null then return jsonb_build_object('error', 'invalidReferral'); end if;
  end if;

  snapshot := public.library_shared_action(actor, case when social then 'state' else action end, payload);
  if snapshot ? 'error' or action in ('leaderboard', 'studySummary') or jsonb_typeof(snapshot->'profile') = 'null' then
    if social and not (snapshot ? 'error') then return jsonb_build_object('error', 'profileRequired'); end if;
    return snapshot;
  end if;

  if inviter_id is not null then
    insert into public.reader_referrals(referred, inviter) values (actor, inviter_id)
      on conflict (referred) do nothing returning id into referral_id;
    if referral_id is not null then
      perform public.grant_study_coins(actor, 'referral:reader:' || referral_id, 5);
      perform public.grant_study_coins(inviter_id, 'referral:inviter:' || referral_id, 10);
    end if;
  end if;

  if social then
    if snapshot#>>'{session,state}' = 'active' and snapshot#>>'{session,paused_at}' is null then
      return jsonb_build_object('error', 'working');
    end if;
    next_snapshot := public.reader_social_action(actor, action, payload, snapshot#>>'{profile,room}');
    if next_snapshot ? 'error' then return next_snapshot; end if;
    if next_snapshot is not null then snapshot := next_snapshot || jsonb_build_object('awarded', snapshot->'awarded'); end if;
  end if;

  quests := public.daily_focus_quests(actor, (clock_timestamp() at time zone 'Europe/Istanbul')::date);
  select * into profile from public.profiles where id = actor;
  return snapshot || jsonb_build_object(
    'profile', (snapshot->'profile') || jsonb_build_object('coins', profile.coins,
      'readerCode', profile.reader_code, 'referralCode', profile.referral_code),
    'dailyQuests', quests,
    'members', (select coalesce(jsonb_agg(member || jsonb_build_object(
      'activity', case when exists (select 1 from public.sessions s where s.user_id = m.user_id and s.state = 'active'
        and s.paused_at is null and s.end_ms > (snapshot->>'now')::bigint
        and (s.next_check_at is null or s.next_check_at + 30000 > (snapshot->>'now')::bigint))
        then 'working' else member->>'status' end) order by position), '[]')
      from jsonb_array_elements(snapshot->'members') with ordinality as members(member, position)
      left join public.room_members m on m.desk_ref = (member->>'desk_ref')::uuid),
    'friends', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', other.name, 'code', other.reader_code,
      'status', case when f.accepted then 'accepted' when f.requested_by = actor then 'sent' else 'incoming' end)
      order by f.accepted desc, other.name, f.id), '[]')
      from public.reader_friendships f join public.profiles other on other.id = case when f.reader_a = actor then f.reader_b else f.reader_a end
      where actor in (f.reader_a, f.reader_b)),
    'studyInvites', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'name', sender.name, 'room', r.name, 'room_en', r.name_en, 'private', r.is_private)
      order by i.expires_at desc), '[]')
      from public.study_invites i join public.profiles sender on sender.id = i.sender
      join public.rooms r on r.id = i.room join public.room_members m on m.user_id = i.sender and m.room = i.room
      where i.recipient = actor and i.expires_at > clock_timestamp() and m.seen > (snapshot->>'now')::bigint - 15000
        and (not r.is_private or r.owner_id is not null))
  );
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
