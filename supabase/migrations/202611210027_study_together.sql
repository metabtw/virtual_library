create table public.study_meets (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (length(topic) between 2 and 80),
  starts_ms bigint not null,
  minutes integer not null check (minutes between 5 and 180),
  room_id text not null references public.rooms(id) on delete cascade
);
create index study_meets_host_time on public.study_meets(host, starts_ms);

create table public.study_meet_members (
  meet_id uuid not null references public.study_meets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.study_plans(id) on delete set null,
  primary key (meet_id, user_id)
);
create index study_meet_members_by_user on public.study_meet_members(user_id);

create table public.study_pair_goals (
  id uuid primary key default gen_random_uuid(),
  friendship uuid not null references public.reader_friendships(id) on delete cascade,
  requester uuid not null references public.profiles(id) on delete cascade,
  week date not null,
  target integer not null check (target between 1 and 10),
  accepted_ms bigint,
  requester_avatar boolean not null default false,
  friend_avatar boolean not null default false,
  unique(friendship, week)
);

alter table public.study_meets enable row level security;
alter table public.study_meet_members enable row level security;
alter table public.study_pair_goals enable row level security;
revoke all on public.study_meets, public.study_meet_members, public.study_pair_goals from public, anon, authenticated;

create function public.remove_meet_plan()
returns trigger language plpgsql set search_path='' as $$
begin
  delete from public.study_plans where id=old.plan_id and user_id=old.user_id;
  return null;
end;
$$;
create trigger remove_meet_plan after delete on public.study_meet_members
  for each row execute function public.remove_meet_plan();

create function public.study_meet_view(meet public.study_meets, viewer uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',meet.id,'topic',meet.topic,'startsAt',meet.starts_ms,'minutes',meet.minutes,
    'host',p.name,'room',r.name,'roomEn',r.name_en,'owner',coalesce(meet.host=viewer,false),
    'joined',m.user_id is not null,'remind',m.plan_id is not null)
  from public.rooms r join public.profiles p on p.id=meet.host
  left join public.study_meet_members m on m.meet_id=meet.id and m.user_id=viewer
  where r.id=meet.room_id
$$;

-- UUID possession grants a preview of the shared appointment, with no private calendar or attendee details.
create function public.study_meet_preview(meet_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select coalesce((select public.study_meet_view(m,null) from public.study_meets m
    where m.id=meet_id and m.starts_ms + m.minutes * 60000 >= public.library_time_ms()-86400000),
    '{"error":"meetUnavailable"}'::jsonb)
$$;

create function public.study_pair_progress(a uuid, b uuid, since_ms bigint, until_ms bigint, target integer)
returns integer language plpgsql stable set search_path='' as $$
declare
  overlap_pair record;
  used_a uuid[] := '{}';
  used_b uuid[] := '{}';
begin
  for overlap_pair in
    select x.id as a_id,y.id as b_id
    from public.sessions x join public.sessions y on y.room_id=x.room_id
      and least(x.end_ms,y.end_ms)-greatest(x.start_ms,y.start_ms)>=300000
    where x.user_id=a and y.user_id=b and x.state='completed' and y.state='completed'
      and x.end_ms between since_ms and until_ms-1 and y.end_ms between since_ms and until_ms-1
      and x.start_ms>=since_ms and y.start_ms>=since_ms
    order by greatest(x.end_ms,y.end_ms),x.id,y.id
  loop
    if not overlap_pair.a_id=any(used_a) and not overlap_pair.b_id=any(used_b) then
      used_a := array_append(used_a,overlap_pair.a_id);
      used_b := array_append(used_b,overlap_pair.b_id);
      if cardinality(used_a)>=target then exit; end if;
    end if;
  end loop;
  return cardinality(used_a);
end;
$$;

create function public.study_together(actor uuid, payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  op text := coalesce(payload->>'op','read');
  token uuid;
  observed bigint := public.library_time_ms();
  week_start date := date_trunc('week', clock_timestamp() at time zone 'Europe/Istanbul')::date;
  meet public.study_meets;
  attendance public.study_meet_members;
  friend public.reader_friendships;
  goal public.study_pair_goals;
  start_ms bigint;
  meeting_time timestamp;
  minutes integer;
  topic text;
  choice boolean;
  reminder_plan uuid;
begin
  if not exists(select 1 from public.profiles where id=actor) then return '{"error":"profileRequired"}'; end if;
  if coalesce(payload->>'id','') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    token := (payload->>'id')::uuid;
  end if;

  if op = 'read' then
    return jsonb_build_object(
      'meets', (select coalesce(jsonb_agg(public.study_meet_view(m,actor) order by m.starts_ms),'[]')
        from public.study_meet_members a join public.study_meets m on m.id=a.meet_id
        where a.user_id=actor and m.starts_ms+m.minutes*60000>=observed-86400000),
      'rooms', (select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'nameEn',r.name_en) order by r.name)
        from public.rooms r where not r.is_private and r.owner_id is null and r.expires_ms is null),
      'friends', (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',p.name) order by p.name),'[]')
        from public.reader_friendships f join public.profiles p on p.id=case when f.reader_a=actor then f.reader_b else f.reader_a end
        where actor in(f.reader_a,f.reader_b) and f.accepted),
      'goals', (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'friend',p.name,'week',g.week,
        'target',g.target,'progress',progress.count,'invite',g.accepted_ms is null,
        'own',g.requester=actor,'avatarAllowed',case when actor=g.requester then g.requester_avatar else g.friend_avatar end,
        'partnerAvatar',case when progress.count=g.target and g.requester_avatar and g.friend_avatar
          then (to_jsonb(v)-'user_id') end) order by g.week desc,p.name),'[]')
        from public.study_pair_goals g join public.reader_friendships f on f.id=g.friendship and f.accepted
        join public.profiles p on p.id=case when actor=f.reader_a then f.reader_b else f.reader_a end
        left join public.avatars v on v.user_id=p.id
        cross join lateral (select case when g.accepted_ms is null then 0 else
          public.study_pair_progress(f.reader_a,f.reader_b,g.accepted_ms,
            (extract(epoch from ((g.week+7)::timestamp at time zone 'Europe/Istanbul'))*1000)::bigint,g.target)
          end as count) progress
        where actor in(f.reader_a,f.reader_b) and g.week>=week_start-7
          and (g.week=week_start or g.accepted_ms is not null))
    );
  end if;

  if op = 'meet' then
    return coalesce((select public.study_meet_view(m,actor) from public.study_meets m
      where m.id=token and m.starts_ms+m.minutes*60000>=observed-86400000),'{"error":"meetUnavailable"}'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
  if op = 'createMeet' then
    if coalesce(payload->>'startsAt','') !~ '^[0-9]{13}$' or coalesce(payload->>'minutes','') !~ '^[0-9]{1,3}$'
      then return '{"error":"meetInvalid"}'; end if;
    start_ms := (payload->>'startsAt')::bigint;
    minutes := (payload->>'minutes')::integer;
    topic := trim(coalesce(payload->>'topic',''));
    if start_ms<=observed or start_ms>observed+2592000000 or minutes not between 5 and 180
      or length(topic) not between 2 and 80 or topic ~ '[[:cntrl:]]'
      or not exists(select 1 from public.rooms r where r.id=payload->>'room' and not r.is_private and r.owner_id is null and r.expires_ms is null)
      then return '{"error":"meetInvalid"}'; end if;
    if (select count(*) from public.study_meets m where m.host=actor and m.starts_ms+m.minutes*60000>=observed)>=12
      then return '{"error":"meetLimit"}'; end if;
    insert into public.study_meets(host,topic,starts_ms,minutes,room_id)
      values(actor,topic,start_ms,minutes,payload->>'room') returning * into meet;
    insert into public.study_meet_members(meet_id,user_id) values(meet.id,actor);
    return public.study_meet_view(meet,actor);
  end if;

  if op in ('rsvp','leaveMeet','cancelMeet') then
    select * into meet from public.study_meets m where m.id=token for update;
    if not found or meet.starts_ms+meet.minutes*60000<=observed then return '{"error":"meetUnavailable"}'; end if;
    if op='cancelMeet' then
      delete from public.study_meets where id=token and host=actor;
      if not found then return '{"error":"meetUnavailable"}'; end if;
      return '{"ok":true}';
    end if;
    if op='leaveMeet' then
      if meet.host=actor then return '{"error":"meetUnavailable"}'; end if;
      delete from public.study_meet_members where meet_id=token and user_id=actor;
      return public.study_meet_view(meet,actor);
    end if;

    choice := payload->'remind' = 'true'::jsonb and meet.starts_ms>observed;
    select * into attendance from public.study_meet_members where meet_id=token and user_id=actor;
    reminder_plan := attendance.plan_id;
    if choice and reminder_plan is null then
      meeting_time := to_timestamp(meet.starts_ms/1000.0) at time zone 'Europe/Istanbul';
      if (select count(*) from public.study_plans p where p.user_id=actor and p.day=meeting_time::date)>=30
        then return '{"error":"plannerDayFull"}'; end if;
      insert into public.study_plans(user_id,day,topic,minutes,questions,logged_minutes,solved,notes,reminder)
        values(actor,meeting_time::date,meet.topic,meet.minutes,0,0,0,'',meeting_time::time)
        returning id into reminder_plan;
    elsif payload->'remind' = 'false'::jsonb then
      delete from public.study_plans where id=reminder_plan and user_id=actor;
      reminder_plan := null;
    end if;
    insert into public.study_meet_members(meet_id,user_id,plan_id) values(token,actor,reminder_plan)
      on conflict(meet_id,user_id) do update set plan_id=excluded.plan_id;
    return public.study_meet_view(meet,actor);
  end if;

  if op='createGoal' then
    if coalesce(payload->>'target','') !~ '^([1-9]|10)$' then return '{"error":"pairInvalid"}'; end if;
    select * into friend from public.reader_friendships where id=token and actor in(reader_a,reader_b) and accepted;
    if not found then return '{"error":"pairInvalid"}'; end if;
    insert into public.study_pair_goals(friendship,requester,week,target,requester_avatar)
      values(token,actor,week_start,(payload->>'target')::int,coalesce(payload->'avatar'='true'::jsonb,false))
      on conflict(friendship,week) do nothing;
    if not found then return '{"error":"pairExists"}'; end if;
  elsif op in ('acceptGoal','leaveGoal','shareGoalAvatar') then
    select g.* into goal from public.study_pair_goals g join public.reader_friendships f on f.id=g.friendship
      where g.id=token and actor in(f.reader_a,f.reader_b) and f.accepted and g.week>=week_start-7
      for update of g;
    if not found then return '{"error":"pairInvalid"}'; end if;
    choice := coalesce(payload->'avatar'='true'::jsonb,false);
    if op='acceptGoal' then
      if goal.requester=actor or goal.week<>week_start or goal.accepted_ms is not null then return '{"error":"pairInvalid"}'; end if;
      update public.study_pair_goals set accepted_ms=observed,friend_avatar=choice where id=token;
    elsif op='leaveGoal' then
      delete from public.study_pair_goals where id=token;
    elsif actor=goal.requester then
      update public.study_pair_goals set requester_avatar=choice where id=token;
    else
      update public.study_pair_goals set friend_avatar=choice where id=token;
    end if;
  else
    return '{"error":"pairInvalid"}';
  end if;
  return '{"ok":true}';
end;
$$;

create function public.study_week_summary(actor uuid)
returns jsonb language sql stable set search_path='' as $$
  with dates as (select date_trunc('week',statement_timestamp() at time zone 'Europe/Istanbul')::date as monday),
  periods as (
    select (s.end_ms-s.start_ms)/60000 as minutes, s.study_topic
      from public.sessions s cross join dates d
      where s.user_id=actor and s.state='completed'
        and s.end_ms >= (extract(epoch from (d.monday::timestamp at time zone 'Europe/Istanbul'))*1000)::bigint
        and s.end_ms < (extract(epoch from ((d.monday+7)::timestamp at time zone 'Europe/Istanbul'))*1000)::bigint
  )
  select jsonb_build_object('starts',d.monday,'ends',d.monday+6,
    'minutes',(select coalesce(sum(minutes),0) from periods),
    'topics',(select coalesce(jsonb_agg(t.study_topic order by t.minutes desc,t.study_topic),'[]')
      from (select study_topic,sum(minutes) minutes from periods where nullif(trim(study_topic),'') is not null
        group by study_topic order by minutes desc,study_topic limit 4) t))
  from dates d
$$;

alter function public.library_action(uuid,text,jsonb) rename to library_before_study_together;
revoke all on function public.library_before_study_together(uuid,text,jsonb) from public, anon, authenticated, service_role;
create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  observed bigint := public.library_time_ms();
  result jsonb;
  meet public.study_meets;
begin
  if action='studyTogether' then return public.study_together(actor,payload); end if;
  if action='joinStudyMeet' then
    if coalesce(payload->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      then return '{"error":"meetUnavailable"}'; end if;
    perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
    select m.* into meet from public.study_meets m join public.study_meet_members a on a.meet_id=m.id
      where m.id=(payload->>'id')::uuid and a.user_id=actor for share of m;
    if not found or observed>=meet.starts_ms+meet.minutes*60000 then return '{"error":"meetUnavailable"}'; end if;
    if observed<meet.starts_ms-300000 then return '{"error":"meetTooEarly"}'; end if;
    result := public.library_before_study_together(actor,'join',payload || jsonb_build_object('room',meet.room_id));
    if result ? 'error' then return result; end if;
    return result || jsonb_build_object('meetingMinutes',meet.minutes);
  end if;
  result := public.library_before_study_together(actor,action,payload);
  if action='studySummary' and not (result ? 'error') then
    return result || jsonb_build_object('week',public.study_week_summary(actor));
  end if;
  return result;
end;
$$;
revoke all on function public.remove_meet_plan(), public.study_meet_view(public.study_meets,uuid),
  public.study_meet_preview(uuid), public.study_pair_progress(uuid,uuid,bigint,bigint,integer),
  public.study_together(uuid,jsonb),public.study_week_summary(uuid),public.library_action(uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.study_meet_preview(uuid),public.library_action(uuid,text,jsonb) to service_role;
