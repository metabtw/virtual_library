create table public.profile_share_codes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  prefix text not null check (prefix in ('SK-', 'DV-')),
  code text not null unique check (left(code, 3) = prefix and substring(code from 4) ~ '^[23456789A-HJ-NP-Z]{5}$'),
  primary key (profile_id, prefix)
);
alter table public.profile_share_codes enable row level security;
revoke all on public.profile_share_codes from public, anon, authenticated;

create function public.assign_profile_share_codes(recipient uuid)
returns void language plpgsql set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  tag text;
  entropy bytea;
  candidate text;
begin
  foreach tag in array array['SK-', 'DV-'] loop
    loop
      entropy := uuid_send(gen_random_uuid());
      select tag || string_agg(substr(alphabet, get_byte(entropy, i) % length(alphabet) + 1, 1), '' order by i)
      into candidate from generate_series(0, 4) as bytes(i);
      insert into public.profile_share_codes (profile_id, prefix, code) values (recipient, tag, candidate)
      on conflict do nothing;
      exit when found or exists (select 1 from public.profile_share_codes where profile_id = recipient and prefix = tag);
    end loop;
  end loop;
end;
$$;
revoke all on function public.assign_profile_share_codes(uuid) from public, anon, authenticated, service_role;

create function public.set_profile_share_codes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assign_profile_share_codes(new.id);
  return new;
end;
$$;
revoke all on function public.set_profile_share_codes() from public, anon, authenticated, service_role;

create trigger set_profile_share_codes after insert on public.profiles
  for each row execute function public.set_profile_share_codes();
select public.assign_profile_share_codes(id) from public.profiles;

alter function public.library_action(uuid, text, jsonb) rename to library_rewards_action;
revoke all on function public.library_rewards_action(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.library_action(actor uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  code_key text := case action when 'addFriend' then 'code' when 'profile' then 'referral' end;
  submitted text := upper(trim(payload->>code_key));
  original_code text;
  snapshot jsonb;
  codes jsonb;
  friends jsonb;
begin
  if submitted ~ '^(SK|DV)-[23456789A-HJ-NP-Z]{5}$' then
    select case c.prefix when 'SK-' then p.reader_code else p.referral_code end
    into original_code
    from public.profile_share_codes c join public.profiles p on p.id = c.profile_id
    where c.code = submitted and (action = 'profile' or c.prefix = 'SK-');
    if found then payload := payload || jsonb_build_object(code_key, original_code); end if;
  end if;

  snapshot := public.library_rewards_action(actor, action, payload);
  if jsonb_typeof(snapshot->'profile') is distinct from 'object' then return snapshot; end if;

  select coalesce(jsonb_object_agg(case prefix when 'SK-' then 'shortReaderCode' else 'shortReferralCode' end, code), '{}')
  into codes from public.profile_share_codes where profile_id = actor;
  select coalesce(jsonb_agg(friend || jsonb_strip_nulls(jsonb_build_object('shortCode', c.code)) order by position), '[]')
  into friends
  from jsonb_array_elements(snapshot->'friends') with ordinality as entries(friend, position)
  left join public.profiles p on p.reader_code = friend->>'code'
  left join public.profile_share_codes c on c.profile_id = p.id and c.prefix = 'SK-';
  return snapshot || jsonb_build_object('profile', (snapshot->'profile') || codes, 'friends', friends);
end;
$$;
revoke all on function public.library_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.library_action(uuid, text, jsonb) to service_role;
