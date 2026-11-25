create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  topic text not null check (length(topic) between 1 and 100),
  minutes integer not null check (minutes between 0 and 1440),
  questions integer not null check (questions between 0 and 10000),
  logged_minutes integer not null check (logged_minutes between 0 and 1440),
  solved integer not null check (solved between 0 and 10000),
  notes text not null check (length(notes) <= 500),
  reminder time(0)
);
create index study_plans_by_day on public.study_plans(user_id, day);
create index study_plans_reminder_day on public.study_plans(day) where reminder is not null;
alter table public.study_plans enable row level security;
revoke all on public.study_plans from public, anon, authenticated;
alter table public.sessions
  add column study_plan_id uuid references public.study_plans(id) on delete set null,
  add column study_topic text;
create index sessions_study_plan on public.sessions(study_plan_id) where study_plan_id is not null;

create function public.study_plan_view(plan public.study_plans)
returns jsonb language sql stable set search_path = '' as $$
  select (to_jsonb(plan) - 'user_id') || jsonb_build_object('reminderAt',
    case when plan.reminder is not null then
      (extract(epoch from ((plan.day + plan.reminder) at time zone 'Europe/Istanbul')) * 1000)::bigint
    end)
$$;

create function public.study_planner(actor uuid, payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
<<plan_fields>>
declare
  today date := (clock_timestamp() at time zone 'Europe/Istanbul')::date;
  first_day date;
  last_day date;
  item_day date;
  item_id uuid;
  topic text;
  notes text;
  minutes integer;
  questions integer;
  logged integer;
  solved integer;
  reminder time(0);
  operation text := coalesce(payload->>'op', 'read');
begin
  if not exists (select 1 from public.profiles where id=actor) then return '{"error":"profileRequired"}'; end if;
  if coalesce(payload->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then return '{"error":"plannerInvalid"}'; end if;
  first_day := (payload->>'month' || '-01')::date;
  if first_day < date '1900-01-01' or first_day > today + interval '5 years' then return '{"error":"plannerInvalid"}'; end if;
  last_day := first_day + interval '1 month';
  if operation in ('save','remove') then
    perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
    item_id := nullif(payload->>'id','')::uuid;
    if operation = 'remove' then
      delete from public.study_plans where id=item_id and user_id=actor;
      if not found then return '{"error":"plannerMissing"}'; end if;
    else
      item_day := (payload->>'day')::date;
      topic := trim(coalesce(payload->>'topic',''));
      notes := trim(coalesce(payload->>'notes',''));
      minutes := (payload->>'minutes')::integer;
      questions := (payload->>'questions')::integer;
      logged := (payload->>'logged_minutes')::integer;
      solved := (payload->>'solved')::integer;
      if item_day is null or item_day < first_day or item_day >= last_day
        or length(topic) not between 1 and 100 or length(notes) > 500
        or minutes is null or minutes not between 0 and 1440
        or questions is null or questions not between 0 and 10000
        or logged is null or logged not between 0 and 1440 or solved is null or solved not between 0 and 10000
        or (item_day > today and (logged > 0 or solved > 0)) then return '{"error":"plannerInvalid"}'; end if;
      if coalesce(payload->>'reminder','') <> '' then
        if payload->>'reminder' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return '{"error":"plannerInvalid"}'; end if;
        reminder := (payload->>'reminder')::time;
      end if;
      if item_id is null then
        if (select count(*) from public.study_plans p where p.user_id=actor and p.day=item_day) >= 30
          then return '{"error":"plannerDayFull"}'; end if;
        insert into public.study_plans(user_id, day, topic, minutes, questions, logged_minutes, solved, notes, reminder)
          values(actor, item_day, topic, minutes, questions, logged, solved, notes, reminder);
      else
        if not exists(select 1 from public.study_plans p where p.id=item_id and p.user_id=actor)
          then return '{"error":"plannerMissing"}'; end if;
        if (select count(*) from public.study_plans p where p.user_id=actor and p.day=item_day and p.id<>item_id) >= 30
          then return '{"error":"plannerDayFull"}'; end if;
        update public.study_plans p set day=item_day, topic=plan_fields.topic, minutes=plan_fields.minutes,
          questions=plan_fields.questions, logged_minutes=logged, solved=plan_fields.solved, notes=plan_fields.notes, reminder=plan_fields.reminder
        where p.id=item_id and p.user_id=actor;
      end if;
    end if;
  elsif operation <> 'read' then return '{"error":"plannerInvalid"}';
  end if;
  return jsonb_build_object('today', today, 'month', to_char(first_day, 'YYYY-MM'),
    'plans', (select coalesce(jsonb_agg(public.study_plan_view(p) order by p.day,p.reminder,p.id),'[]')
      from public.study_plans p where p.user_id=actor and p.day>=first_day and p.day<last_day),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'topic',s.study_topic,'planId',s.study_plan_id,
        'day',(to_timestamp(s.end_ms/1000.0) at time zone 'Europe/Istanbul')::date,
        'minutes',(s.end_ms-s.start_ms)/60000,'endsAt',s.end_ms) order by s.end_ms),'[]')
      from public.sessions s where s.user_id=actor and s.state='completed'
        and s.end_ms >= extract(epoch from (first_day::timestamp at time zone 'Europe/Istanbul'))*1000
        and s.end_ms < extract(epoch from (last_day::timestamp at time zone 'Europe/Istanbul'))*1000));
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
  return '{"error":"plannerInvalid"}';
end;
$$;

alter function public.library_action(uuid,text,jsonb) rename to library_before_planner;
revoke all on function public.library_before_planner(uuid,text,jsonb) from public, anon, authenticated, service_role;
create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := (clock_timestamp() at time zone 'Europe/Istanbul')::date;
  result jsonb;
  plan public.study_plans;
begin
  if action = 'studyPlanner' then return public.study_planner(actor, payload); end if;
  if action = 'start' then
    perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
    if coalesce(payload->>'planId','') <> '' then
      select p.* into plan from public.study_plans p where p.id::text=payload->>'planId' and p.user_id=actor and p.day=today;
      if not found then return '{"error":"plannerMissing"}'; end if;
    end if;
  end if;
  result := public.library_before_planner(actor, action, payload);
  if jsonb_typeof(result->'profile') is distinct from 'object' then return result; end if;
  if action = 'start' then
    update public.sessions set study_plan_id=plan.id,
      study_topic=coalesce(plan.topic, nullif(result#>>'{profile,target}',''))
      where user_id=actor and state='active';
  end if;
  return result || jsonb_build_object('todayPlans', (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'topic',p.topic,'minutes',p.minutes,
      'reminderAt',public.study_plan_view(p)->'reminderAt') order by p.reminder,p.id),'[]')
    from public.study_plans p where p.user_id=actor and p.day=today));
end;
$$;
revoke all on function public.study_plan_view(public.study_plans), public.study_planner(uuid,jsonb), public.library_action(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.library_action(uuid,text,jsonb) to service_role;

create table public.study_reminder_delivery (
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  token text not null references public.push_devices(token) on delete cascade,
  due timestamptz not null,
  next_attempt timestamptz not null default clock_timestamp(),
  attempts int not null default 0,
  sent boolean not null default false,
  primary key(plan_id,token,due)
);
alter table public.study_reminder_delivery enable row level security;
revoke all on public.study_reminder_delivery from public, anon, authenticated;
grant select, update on public.study_reminder_delivery to service_role;
create index study_reminders_due on public.study_reminder_delivery(next_attempt) where not sent;
create index study_reminders_expiry on public.study_reminder_delivery(due);

create function public.claim_study_reminders()
returns table(plan_id uuid, token text, due timestamptz, attempts integer, locale text)
language plpgsql security definer set search_path = '' as $$
declare observed timestamptz := clock_timestamp();
begin
  delete from public.study_reminder_delivery q where q.due < observed-interval '2 days';
  insert into public.study_reminder_delivery(plan_id,token,due,next_attempt)
    select p.id,d.token,(p.day+p.reminder) at time zone 'Europe/Istanbul',observed
    from public.study_plans p join public.push_devices d on d.user_id=p.user_id
    where p.day between (observed at time zone 'Europe/Istanbul')::date-1 and (observed at time zone 'Europe/Istanbul')::date
      and ((p.day+p.reminder) at time zone 'Europe/Istanbul') between observed-interval '20 minutes' and observed
    on conflict do nothing;
  return query
    with ready as (
      select q.plan_id,q.token,q.due,d.locale from public.study_reminder_delivery q
      join public.study_plans p on p.id=q.plan_id
      join public.push_devices d on d.token=q.token and d.user_id=p.user_id
      where not q.sent and q.attempts < 4 and q.next_attempt <= observed and q.due > observed-interval '20 minutes'
        and q.due=((p.day+p.reminder) at time zone 'Europe/Istanbul')
      order by q.next_attempt,q.plan_id limit 50 for update of q skip locked
    ), leased as (
      update public.study_reminder_delivery q set attempts=q.attempts+1,next_attempt=observed+interval '2 minutes'
      from ready r where (q.plan_id,q.token,q.due)=(r.plan_id,r.token,r.due)
      returning q.plan_id,q.token,q.due,q.attempts,r.locale
    ) select l.plan_id,l.token,l.due,l.attempts,l.locale from leased l;
end;
$$;
revoke all on function public.claim_study_reminders() from public, anon, authenticated;
grant execute on function public.claim_study_reminders() to service_role;
