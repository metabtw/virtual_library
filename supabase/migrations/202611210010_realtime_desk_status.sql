create policy room_desk_status_read on realtime.messages for select to authenticated using (
  extension = 'broadcast' and exists (
    select 1 from public.room_members where user_id = (select auth.uid())
      and 'room:' || room = (select realtime.topic())
  )
);

create function public.broadcast_desk_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('desk', new.desk_ref, 'status', new.status,
      'at', floor(extract(epoch from clock_timestamp()) * 1000)::bigint),
    'desk_status', 'room:' || new.room, true
  );
  return null;
end;
$$;
revoke all on function public.broadcast_desk_status() from public, anon, authenticated;

create trigger broadcast_desk_status after update of status on public.room_members
  for each row when (old.room = new.room and old.status is distinct from new.status)
  execute function public.broadcast_desk_status();
