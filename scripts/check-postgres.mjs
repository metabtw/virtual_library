import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const directory = new URL('../supabase/migrations/', import.meta.url);
async function action(id, name, payload = {}) {
  const { rows } = await db.query('select public.library_action($1, $2, $3) as result',
    [id, name, JSON.stringify(payload)]);
  return rows[0].result;
}

async function shiftSession(id, milliseconds) {
  await db.query('update public.sessions set start_ms = start_ms - $2, end_ms = end_ms - $2 where user_id = $1', [id, milliseconds]);
}

async function settle() {
  const { rows } = await db.query('select public.settle_focus_sessions() as count');
  return rows[0].count;
}

try {
  // Minimal Supabase-managed objects. These tests exercise Postgres, not hosted Auth or Realtime transport.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema realtime;
    create schema storage;
    create table auth.users (id uuid primary key);
    create table storage.buckets (id text primary key, name text, public boolean);
    create table realtime.messages (extension text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function realtime.topic() returns text language sql stable as $$ select 'room:night'::text $$;
    alter table realtime.messages enable row level security;
    grant usage on schema auth, realtime to authenticated;
    grant select, insert on realtime.messages to authenticated;
  `);
  for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
  }

  const users = Array.from({ length: 10 }, (_, i) => '00000000-0000-4000-a000-' + String(i + 1).padStart(12, '0'));
  for (const [index, user] of users.entries()) {
    await db.query('insert into auth.users values ($1)', [user]);
    const profile = await action(user, 'profile', {
      name: 'Okur ' + index, gender: index % 2 ? 'male' : 'female',
      hair: index % 3, outfit: index % 3, color: '#bd7050',
    });
    assert.equal(profile.profile.coins, 30);
    const joined = await action(user, 'join', { room: 'night' });
    if (index < 9) assert.equal(joined.rooms.find(room => room.id === 'night').count, index + 1);
    else assert.equal(joined.error, 'roomFull');
  }

  const [first, second, third] = users;
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [first]);
  assert.equal((await db.query('select * from public.profiles')).rows.length, 1);
  await assert.rejects(db.query('update public.profiles set coins = 100'));
  await assert.rejects(action(first, 'buy', { item: 'lamp' }));
  await assert.rejects(db.query('select * from public.push_devices'));
  await assert.rejects(db.query('select * from public.claim_focus_rewards()'));
  await assert.rejects(settle());
  await db.exec('reset role');

  assert.equal((await action(first, 'buy', { item: 'plant' })).profile.coins, 10);
  assert.equal((await action(first, 'buy', { item: 'cat' })).error, 'insufficientCoins');
  assert.deepEqual((await action(first, 'place', { item: 'plant' })).members.find(member => member.own).placed, ['plant']);

  await action(first, 'start', { duration: 50 });
  assert.equal((await action(first, 'leave')).error, 'working');
  const pause = await action(first, 'status', { status: 'break' });
  assert.ok(pause.session.paused_at);
  const resume = await action(first, 'status', { status: 'desk' });
  assert.equal(resume.session.paused_at, null);
  assert.equal(resume.session.end - resume.session.start, 50 * 60000);
  await shiftSession(first, 1231000);
  assert.equal(await settle(), 1);
  assert.equal((await action(first, 'verify')).error, 'verificationClosed');
  const invalid = await action(first, 'state');
  assert.equal(invalid.session.state, 'invalid');
  assert.equal(invalid.profile.coins, 10);

  await db.query("insert into public.push_devices values ('ExpoPushToken[example_first]', $1, 'tr')", [second]);
  await action(second, 'start', { duration: 50 });
  await shiftSession(second, 1200100);
  assert.equal((await action(second, 'verify')).session.checks, 1);
  await shiftSession(second, 1200000);
  assert.equal((await action(second, 'verify')).session.checks, 2);
  await shiftSession(second, 600000);
  await db.query('update public.room_members set seen = 123 where user_id = $1', [second]);
  assert.equal(await settle(), 1);
  assert.equal(await settle(), 0);
  const membership = await db.query('select seen from public.room_members where user_id = $1', [second]);
  assert.equal(Number(membership.rows[0].seen), 123, 'maintenance must not refresh Presence');
  const reward = await action(second, 'state');
  assert.equal(reward.profile.coins, 40);
  assert.equal(reward.session.state, 'completed');

  await db.query("insert into public.push_devices values ('ExpoPushToken[example_second]', $1, 'en')", [third]);
  await action(third, 'start', { duration: 5 });
  await shiftSession(third, 300100);
  const immediate = await action(third, 'state');
  assert.equal(immediate.awarded, 1);
  assert.equal(immediate.profile.coins, 31);
  assert.equal(await settle(), 0);
  await db.exec('set role service_role');
  const claimed = (await db.query('select token, amount, locale, attempts from public.claim_focus_rewards() order by token')).rows;
  assert.deepEqual(claimed, [
    { token: 'ExpoPushToken[example_first]', amount: 10, locale: 'tr', attempts: 1 },
    { token: 'ExpoPushToken[example_second]', amount: 1, locale: 'en', attempts: 1 },
  ]);
  assert.equal((await db.query('select * from public.claim_focus_rewards()')).rows.length, 0);
  await db.exec('reset role');
  await db.exec("update public.reward_delivery set next_attempt = clock_timestamp() - interval '1 second'");
  assert.deepEqual((await db.query('select attempts from public.claim_focus_rewards()')).rows,
    [{ attempts: 2 }, { attempts: 2 }]);
  await db.query('delete from auth.users where id = $1', [second]);
  assert.equal((await db.query('select 1 from public.coin_ledger where user_id = $1', [second])).rows.length, 0);
  assert.equal((await db.query('select 1 from public.reward_delivery')).rows.length, 1);
  console.log('Postgres: migration, RLS, capacity, commerce, pause, verification, reward settlement, retry lease and account deletion passed.');
} finally {
  await db.close();
}
