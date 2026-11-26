create table public.study_demos (
  id uuid primary key default gen_random_uuid(),
  key_hash bytea not null,
  network_hash text not null,
  created_ms bigint not null,
  expires_ms bigint not null,
  started_ms bigint,
  finish_ms bigint,
  check_ms bigint,
  seen_ms bigint,
  imported_at bigint
);
create index study_demos_network on public.study_demos(network_hash,created_ms);
create index study_demos_expiry on public.study_demos(expires_ms);

create table public.study_demo_periods (
  demo_id uuid not null references public.study_demos(id) on delete cascade,
  start_ms bigint not null,
  end_ms bigint not null,
  primary key (demo_id,start_ms)
);
create table public.study_demo_imports (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  demo_id uuid not null unique,
  minutes integer not null
);
alter table public.study_demos enable row level security;
alter table public.study_demo_periods enable row level security;
alter table public.study_demo_imports enable row level security;
revoke all on public.study_demos,public.study_demo_periods,public.study_demo_imports from public,anon,authenticated;

create function public.study_demo_snapshot(demo public.study_demos, instant bigint, outcome text default null)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',demo.id,'now',instant,'expiresAt',demo.expires_ms,
    'startAt',demo.started_ms,'endAt',demo.finish_ms,'verifyAt',demo.check_ms,
    'imported',demo.imported_at is not null,'outcome',outcome,
    'minutes',coalesce((select sum((p.end_ms-p.start_ms)/60000) from public.study_demo_periods p where p.demo_id=demo.id),0))
$$;

create function public.finish_demo_period(demo public.study_demos, finish bigint, record_period boolean)
returns public.study_demos language plpgsql set search_path='' as $$
begin
  if record_period and finish-demo.started_ms >= 60000 then
    insert into public.study_demo_periods(demo_id,start_ms,end_ms)
      values(demo.id,demo.started_ms,finish) on conflict do nothing;
  end if;
  update public.study_demos set started_ms=null,finish_ms=null,check_ms=null,seen_ms=null
    where id=demo.id returning * into demo;
  return demo;
end;
$$;

create function public.study_demo(key_in text, id_in text, operation text, network_in text default '', duration_in integer default null, actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  demo public.study_demos;
  instant bigint := public.library_time_ms();
  deadline bigint;
  outcome text;
  imported integer;
begin
  if coalesce(key_in,'') !~ '^[a-f0-9]{64}$' then return '{"error":"demoMissing"}'; end if;
  if operation = 'new' then
    if coalesce(network_in,'') !~ '^[a-f0-9]{64}$' then return '{"error":"demoMissing"}'; end if;
    perform pg_advisory_xact_lock(hashtextextended('study-demo-new',0));
    if (select count(*) from public.study_demos where created_ms>instant-3600000 and network_hash=network_in)>=12
      or (select count(*) from public.study_demos where expires_ms>instant)>=3000 then return '{"error":"demoLimit"}'; end if;
    insert into public.study_demos(key_hash,network_hash,created_ms,expires_ms)
      values(sha256(convert_to(key_in,'UTF8')),network_in,instant,instant+7200000) returning * into demo;
    return public.study_demo_snapshot(demo,instant);
  end if;

  if coalesce(id_in,'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    then return '{"error":"demoMissing"}'; end if;
  if operation='claim' then
    if not exists(select 1 from public.profiles where id=actor) then return '{"error":"profileRequired"}'; end if;
    perform pg_advisory_xact_lock(hashtextextended('user:'||actor::text,0));
  end if;
  select * into demo from public.study_demos d
    where d.id=id_in::uuid and d.key_hash=sha256(convert_to(key_in,'UTF8')) for update;
  if not found or demo.expires_ms < instant-604800000 then return '{"error":"demoMissing"}'; end if;
  if demo.imported_at is not null then
    if operation='claim' then
      select i.minutes into imported from public.study_demo_imports i where i.user_id=actor and i.demo_id=demo.id;
      if found then return jsonb_build_object('minutes',imported); end if;
      return '{"error":"demoImported"}';
    end if;
    return public.study_demo_snapshot(demo,instant);
  end if;

  deadline := least(instant,demo.finish_ms);
  if demo.started_ms is not null then
    if (demo.check_ms < demo.finish_ms and instant >= demo.check_ms+30000 and demo.check_ms<=deadline)
      or demo.seen_ms+300000 < deadline then
      demo := public.finish_demo_period(demo,deadline,false);
      outcome := 'invalid';
    elsif demo.finish_ms <= instant then
      demo := public.finish_demo_period(demo,deadline,not coalesce(demo.check_ms < deadline,false));
      outcome := 'finished';
    end if;
  end if;

  if operation='claim' then
    if demo.started_ms is not null then
      demo := public.finish_demo_period(demo,instant,not coalesce(instant>=demo.check_ms,false));
    end if;
    if exists(select 1 from public.study_demo_imports i where i.user_id=actor) then return '{"error":"demoAccountUsed"}'; end if;
    with eligible as (
      select p.start_ms,p.end_ms from public.study_demo_periods p where p.demo_id=demo.id
        and not exists(select 1 from public.sessions s where s.user_id=actor and s.state in ('active','completed')
          and s.start_ms<p.end_ms and s.end_ms>p.start_ms)
    ), transferred as (
      insert into public.sessions(user_id,start_ms,end_ms,state)
        select actor,e.start_ms,e.end_ms,'completed' from eligible e returning start_ms,end_ms
    )
    select coalesce(sum((t.end_ms-t.start_ms)/60000),0)::integer into imported from transferred t;
    insert into public.study_demo_imports(user_id,demo_id,minutes) values(actor,demo.id,imported);
    update public.study_demos set imported_at=instant where id=demo.id;
    return jsonb_build_object('minutes',imported);
  end if;

  if operation='start' then
    if instant>=demo.expires_ms then return public.study_demo_snapshot(demo,instant); end if;
    if duration_in not in (5,25,50,90) or duration_in is null then return '{"error":"invalidDuration"}'; end if;
    if demo.started_ms is null then
      update public.study_demos set started_ms=instant,seen_ms=instant,
        finish_ms=least(instant+duration_in*60000,demo.expires_ms),check_ms=instant+1200000
        where id=demo.id returning * into demo;
    end if;
  elsif operation='verify' then
    if demo.started_ms is null or instant<demo.check_ms or demo.check_ms>=demo.finish_ms
      then return public.study_demo_snapshot(demo,instant,outcome); end if;
    update public.study_demos set check_ms=check_ms+1200000,seen_ms=instant
      where id=demo.id returning * into demo;
  elsif operation='stop' and demo.started_ms is not null then
    demo := public.finish_demo_period(demo,instant,not coalesce(instant>=demo.check_ms,false));
  elsif operation='state' and demo.started_ms is not null then
    update public.study_demos set seen_ms=instant where id=demo.id returning * into demo;
  elsif operation not in ('stop','state') then return '{"error":"demoMissing"}';
  end if;
  return public.study_demo_snapshot(demo,instant,outcome);
end;
$$;
revoke all on function public.study_demo_snapshot(public.study_demos,bigint,text),public.finish_demo_period(public.study_demos,bigint,boolean),
  public.study_demo(text,text,text,text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.study_demo(text,text,text,text,integer,uuid) to service_role;

alter function public.settle_focus_sessions() rename to settle_focus_before_demos;
revoke all on function public.settle_focus_before_demos() from public,anon,authenticated,service_role;
create function public.settle_focus_sessions() returns integer language plpgsql security definer set search_path='' as $$
declare settled integer;
begin
  settled := public.settle_focus_before_demos();
  delete from public.study_demos where id in (
    select id from public.study_demos where expires_ms < public.library_time_ms()-604800000 limit 300
  );
  return settled;
end;
$$;
revoke all on function public.settle_focus_sessions() from public,anon,authenticated;
grant execute on function public.settle_focus_sessions() to service_role;
