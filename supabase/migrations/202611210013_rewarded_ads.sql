create table public.rewarded_ad_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('admob', 'web')),
  placement text not null,
  opened_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '15 minutes'),
  transaction_id text,
  rewarded_at timestamptz,
  retry_at timestamptz,
  unique (provider, transaction_id)
);
create index rewarded_ads_by_reader on public.rewarded_ad_attempts(user_id, opened_at desc);
create index rewarded_ads_by_day on public.rewarded_ad_attempts(user_id, rewarded_at desc) where rewarded_at is not null;
alter table public.rewarded_ad_attempts enable row level security;
revoke all on public.rewarded_ad_attempts from anon, authenticated;

create function public.ad_retry_at(actor uuid)
returns bigint language sql set search_path = '' as $$
  select coalesce((select (extract(epoch from retry_at) * 1000)::bigint
    from public.rewarded_ad_attempts where user_id = actor and rewarded_at is not null
    order by rewarded_at desc limit 1), 0)
$$;
revoke all on function public.ad_retry_at(uuid) from public, anon, authenticated;

create function public.open_rewarded_ad(actor uuid, network text, unit text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  observed timestamptz := clock_timestamp();
  observed_ms bigint := (extract(epoch from observed) * 1000)::bigint;
  attempt uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('user:' || actor::text, 0));
  if not exists (select 1 from public.profiles where id = actor) then
    return jsonb_build_object('error', 'profileRequired');
  end if;
  if exists (select 1 from public.sessions where user_id = actor and state = 'active' and paused_at is null
    and end_ms > observed_ms and (next_check_at is null or next_check_at + 30000 > observed_ms)) then
    return jsonb_build_object('error', 'working');
  end if;
  if public.ad_retry_at(actor) > observed_ms then return jsonb_build_object('error', 'adCooldown'); end if;

  delete from public.rewarded_ad_attempts where user_id = actor and rewarded_at is null and expires_at < observed - interval '1 day';
  select a.id into attempt from public.rewarded_ad_attempts a
    where a.user_id = actor and a.provider = network and a.placement = unit
      and a.rewarded_at is null and a.expires_at > observed + interval '2 minutes'
    order by a.opened_at desc limit 1;
  if attempt is null then
    insert into public.rewarded_ad_attempts(user_id, provider, placement)
      values (actor, network, unit) returning id into attempt;
  end if;
  return jsonb_build_object('attempt', attempt);
end;
$$;
revoke all on function public.open_rewarded_ad(uuid, text, text) from public, anon, authenticated;
grant execute on function public.open_rewarded_ad(uuid, text, text) to service_role;

create function public.credit_rewarded_ad(attempt uuid, network text, unit text, transaction_key text, watched_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  entry public.rewarded_ad_attempts;
  observed timestamptz := clock_timestamp();
  day_start timestamptz := date_trunc('day', observed at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  completed_today integer;
  wait_minutes integer;
begin
  if coalesce(char_length(transaction_key), 0) not between 1 and 200 then return false; end if;
  select user_id into recipient from public.rewarded_ad_attempts where id = attempt and provider = network and placement = unit;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('user:' || recipient::text, 0));
  select * into entry from public.rewarded_ad_attempts where id = attempt for update;
  if not found then return false; end if;
  if entry.rewarded_at is not null then return entry.transaction_id = transaction_key; end if;
  if watched_at is null or watched_at < entry.opened_at - interval '1 second' or watched_at > entry.expires_at
    or watched_at > observed + interval '5 minutes' or watched_at < observed - interval '1 day'
    or public.ad_retry_at(recipient) > extract(epoch from observed) * 1000 then return false; end if;

  select count(*) into completed_today from public.rewarded_ad_attempts where user_id = recipient and rewarded_at >= day_start;
  wait_minutes := case completed_today when 0 then 10 when 1 then 20 else 40 end;
  begin
    update public.rewarded_ad_attempts
      set transaction_id = transaction_key, rewarded_at = observed, retry_at = observed + make_interval(mins => wait_minutes)
      where id = attempt;
  exception when unique_violation then
    return false;
  end;
  return public.grant_study_coins(recipient, 'rewarded-ad:' || attempt, 5);
end;
$$;
revoke all on function public.credit_rewarded_ad(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.credit_rewarded_ad(uuid, text, text, text, timestamptz) to service_role;

alter function public.library_action(uuid, text, jsonb) rename to library_social_action;
revoke all on function public.library_social_action(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb := public.library_social_action(actor, action, payload);
begin
  if jsonb_typeof(snapshot->'profile') = 'object' then
    return snapshot || jsonb_build_object('adRetryAt', public.ad_retry_at(actor));
  end if;
  return snapshot;
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
