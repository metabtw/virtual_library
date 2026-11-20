create table public.reward_delivery (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  token text not null references public.push_devices(token) on delete cascade,
  amount integer not null check (amount > 0),
  attempts integer not null default 0,
  next_attempt timestamptz not null default clock_timestamp(),
  unique (session_id, token)
);
create index reward_delivery_due on public.reward_delivery(next_attempt);
alter table public.reward_delivery enable row level security;
revoke all on public.reward_delivery from anon, authenticated;
grant select, update, delete on public.reward_delivery to service_role;

-- Enqueue in the same transaction as the reward, including rewards granted by library_action.
create function public.enqueue_focus_reward()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.reward_delivery (session_id, token, amount)
    select new.id, d.token, (new.end_ms - new.start_ms) / 300000
    from public.push_devices d where d.user_id = new.user_id
    on conflict (session_id, token) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_focus_reward() from public, anon, authenticated;
create trigger queue_focus_reward after update of state on public.sessions
  for each row when (old.state = 'active' and new.state = 'completed')
  execute function public.enqueue_focus_reward();

-- Maintenance must not refresh Presence or rejoin disconnected users.
create function public.settle_focus_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  candidate record;
  pending public.sessions;
  due bigint;
  reward integer;
  changed integer := 0;
begin
  for candidate in
    select s.id, s.user_id from public.sessions s
    where s.state = 'active'
      and ((s.paused_at is null and least(s.end_ms, s.start_ms + (s.checks + 1) * 1200000 + 30000) <= current_ms)
        or s.verification_due + 30000 <= current_ms)
    order by s.end_ms, s.id limit 250
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('user:' || candidate.user_id::text, 0)) then continue; end if;
    select * into pending from public.sessions where id = candidate.id and state = 'active';
    if not found then continue; end if;
    due := coalesce(pending.verification_due, case when pending.paused_at is null
      then pending.start_ms + (pending.checks + 1) * 1200000 end);

    if due < pending.end_ms and current_ms >= due + 30000 then
      update public.sessions set state = 'invalid' where id = pending.id;
      changed := changed + 1;
    elsif pending.paused_at is null and current_ms >= pending.end_ms then
      reward := (pending.end_ms - pending.start_ms) / 300000;
      update public.sessions set state = 'completed' where id = pending.id;
      insert into public.coin_ledger values (pending.id::text, pending.user_id, reward);
      update public.profiles set coins = coins + reward where id = pending.user_id;
      changed := changed + 1;
    end if;
  end loop;
  return changed;
end;
$$;
revoke all on function public.settle_focus_sessions() from public, anon, authenticated;
grant execute on function public.settle_focus_sessions() to service_role;

-- Lease each message before sending. An interrupted runner can retry after the lease expires.
create function public.claim_focus_rewards()
returns table (id uuid, token text, amount integer, attempts integer, locale text, user_id uuid)
language sql security definer set search_path = '' as $$
  with ready as (
    select q.id from public.reward_delivery q
    where q.next_attempt <= clock_timestamp()
    order by q.next_attempt, q.id limit 50
    for update skip locked
  ), leased as (
    update public.reward_delivery q
    set attempts = q.attempts + 1, next_attempt = clock_timestamp() + interval '2 minutes'
    from ready where q.id = ready.id returning q.*
  )
  select l.id, l.token, l.amount, l.attempts,
    case when d.user_id = s.user_id then d.locale end, s.user_id
  from leased l join public.sessions s on s.id = l.session_id
  left join public.push_devices d on d.token = l.token
$$;
revoke all on function public.claim_focus_rewards() from public, anon, authenticated;
grant execute on function public.claim_focus_rewards() to service_role;
