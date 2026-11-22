create or replace function public.room_membership_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  observed bigint := public.library_time_ms();
begin
  if tg_op = 'UPDATE' and old.room = new.room then
    -- The older heartbeat path can reclaim a seat without inserting a new row.
    update public.rooms set empty_since_ms = null where id = new.room and empty_since_ms is not null;
    if old.seen <= observed - 15000 and new.seen > observed - 15000 then
      perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || new.room, true);
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then
    update public.rooms r set empty_since_ms = least(observed, greatest(old.seen + 15000,
      coalesce((select max(m.seen) + 15000 from public.room_members m where m.room = r.id), 0)))
    where r.id = old.room and r.is_private and r.owner_id is not null and r.empty_since_ms is null
      and not exists (select 1 from public.room_members m where m.room = r.id and m.seen > observed - 15000);
    perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || old.room, true);
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' then delete from public.room_connections where user_id = new.user_id; end if;
    update public.rooms set empty_since_ms = null where id = new.room and empty_since_ms is not null;
    perform realtime.send('{}'::jsonb, 'room_membership', 'room:' || new.room, true);
  end if;
  return null;
end;
$$;

update public.rooms r set empty_since_ms = null where r.empty_since_ms is not null
  and exists (select 1 from public.room_members m where m.room = r.id and m.seen > public.library_time_ms() - 15000);
