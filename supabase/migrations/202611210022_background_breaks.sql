create or replace function public.sync_room_connections(actor uuid, observed bigint)
returns boolean language plpgsql set search_path = '' as $$
declare
  lease bigint;
  tag text;
  period_lease bigint;
begin
  select max(expires_ms), case when not bool_or(away_tag is null)
    then (array_agg(away_tag order by expires_ms desc, client_id))[1] end
  into lease, tag from public.room_connections where user_id = actor and expires_ms > observed;
  if lease is null then return false; end if;

  select case when tag is null then s.last_online_ms + 300000
    when s.state = 'completed' then s.end_ms + s.break_minutes * 60000::bigint + 300000 end
  into period_lease from public.sessions s
  join public.room_members m on m.user_id = s.user_id and m.room = s.room_id
  where s.user_id = actor and s.break_minutes is not null and (
    s.state = 'active' or (s.state = 'completed' and not s.break_returned and s.end_ms + s.break_minutes * 60000::bigint > observed))
  order by s.start_ms desc limit 1;

  update public.room_members set seen = greatest(lease, period_lease) - 15000, away_tag = tag where user_id = actor;
  return true;
end;
$$;
