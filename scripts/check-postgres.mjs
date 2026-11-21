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

  const begin = await action(first, 'start', { duration: 50 });
  assert.equal(begin.session.next_check_at, begin.session.start + 20 * 60000);
  assert.equal(begin.session.check_until, begin.session.next_check_at + 30000);
  assert.equal((await action(first, 'leave')).error, 'working');
  const pause = await action(first, 'status', { status: 'break' });
  assert.ok(pause.session.paused_at);
  assert.equal(pause.session.next_check_at, null);
  const resume = await action(first, 'status', { status: 'desk' });
  assert.equal(resume.session.paused_at, null);
  assert.equal(resume.session.end - resume.session.start, 50 * 60000);
  assert.equal(resume.session.next_check_at, resume.session.start + 20 * 60000);
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
  const outsider = users[9];
  const room = await action(first, 'createRoom', { name: 'Akşam Grubu' });
  const privateRoom = room.rooms.find(entry => entry.private);
  assert.equal(room.profile.coins, 0);
  assert.match(privateRoom.invite, /^\d{6}$/);
  assert.equal((await action(first, 'createRoom', { name: 'Yedek' })).error, 'insufficientCoins');
  assert.equal((await action(outsider, 'state')).rooms.some(entry => entry.private), false);
  assert.equal((await action(outsider, 'join', { room: privateRoom.id })).error, 'inviteRequired');

  const joined = await action(third, 'joinCode', { code: privateRoom.invite });
  assert.equal(joined.profile.room, privateRoom.id);
  assert.equal(joined.rooms.find(entry => entry.id === privateRoom.id).invite, null);
  await action(third, 'target', { target: 'Matematik Vize' });
  const shared = await action(first, 'state');
  assert.deepEqual(shared.rooms.find(entry => entry.id === privateRoom.id).targets, ['Matematik Vize']);
  assert.equal(shared.members.find(entry => entry.target === 'Matematik Vize').own, false);

  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [outsider]);
  assert.equal((await db.query('select count(*)::int as count from public.rooms where is_private')).rows[0].count, 0);
  await assert.rejects(db.query('select * from public.private_room_invites'));
  await db.exec('reset role');
  const wrongCode = privateRoom.invite === '000000' ? '000001' : '000000';
  for (let attempt = 0; attempt < 6; attempt++) {
    assert.equal((await action(outsider, 'joinCode', { code: wrongCode })).error, 'invalidInvite');
  }
  assert.equal((await action(outsider, 'joinCode', { code: privateRoom.invite })).error, 'inviteLimited');

  await action(third, 'buy', { item: 'cat' });
  await action(third, 'start', { duration: 50 });
  await action(third, 'abandon');
  assert.deepEqual((await action(third, 'state')).pet, { xp: 0, upset: true });
  assert.equal((await action(third, 'state')).rooms.find(entry => entry.id === privateRoom.id).minutes, 0);
  await db.query('insert into public.room_progress (room_id, minutes) values ($1,450)', [privateRoom.id]);
  await action(third, 'start', { duration: 50 });
  await shiftSession(third, 1200100);
  await action(third, 'verify');
  await shiftSession(third, 1200000);
  await action(third, 'verify');
  await shiftSession(third, 600000);
  assert.equal(await settle(), 1);
  assert.equal(await settle(), 0);
  const milestone = await action(third, 'state');
  assert.equal(milestone.rooms.find(entry => entry.id === privateRoom.id).minutes, 500);
  assert.deepEqual(milestone.pet, { xp: 1, upset: false });
  assert.equal(milestone.chests, 1);
  assert.equal((await action(first, 'state')).chests, 1);
  assert.equal((await action(outsider, 'state')).chests, 0);

  const opening = await action(third, 'openChest');
  assert.equal(opening.chests, 0);
  assert.ok(['goldKeys', 'dragon', 'neon'].includes(opening.drop.item));
  assert.equal((await action(third, 'openChest')).error, 'noChest');
  assert.equal((await action(third, 'openBox')).error, 'insufficientCoins');
  await db.query('update public.profiles set coins = 80 where id = $1', [third]);
  assert.equal((await action(third, 'buy', { item: 'neon' })).error, 'itemMissing');
  const box = await action(third, 'openBox');
  assert.equal(box.profile.coins, 30);
  assert.notEqual(box.drop.item, opening.drop.item);
  assert.equal((await action(third, 'buy', { item: 'space' })).profile.coins, 0);
  assert.equal((await action(third, 'place', { item: 'space' })).error, 'itemMissing');

  const shopper = users[3];
  const catalog = {
    auroraHood: ['wearable', 24], archiveVest: ['wearable', 20], moonCoat: ['wearable', 28],
    copperCurls: ['hair', 14], silverBraid: ['hair', 18], midnightFade: ['hair', 12],
    teaSet: ['desk', 9], hourglass: ['desk', 11], miniGlobe: ['desk', 16], crystalTerrarium: ['desk', 22],
  };
  const priceTotal = Object.values(catalog).reduce((sum, [, price]) => sum + price, 0);
  await db.query('update public.profiles set coins = $2 where id = $1', [shopper, priceTotal]);
  const storefront = await action(shopper, 'state');
  for (const [item, [kind, price]] of Object.entries(catalog)) {
    assert.ok(storefront.items.some(entry => entry.id === item && entry.kind === kind && entry.price === price));
    const purchase = await action(shopper, 'buy', { item });
    assert.ok(purchase.inventory.some(entry => entry.item === item && !entry.placed));
  }
  assert.equal((await action(shopper, 'state')).profile.coins, 0);
  assert.equal((await action(shopper, 'buy', { item: 'teaSet' })).error, 'itemOwned');
  const rare = storefront.items.filter(entry => entry.kind === 'rare').map(entry => entry.id).sort();
  assert.deepEqual(rare, ['dragon', 'goldKeys', 'neon']);
  for (const item of rare) assert.equal((await action(shopper, 'buy', { item })).error, 'itemMissing');
  const baseAvatar = storefront.profile.avatar;
  await action(shopper, 'place', { item: 'auroraHood' });
  await action(shopper, 'place', { item: 'archiveVest' });
  await action(shopper, 'place', { item: 'copperCurls' });
  await action(shopper, 'place', { item: 'silverBraid' });
  await action(shopper, 'place', { item: 'teaSet' });
  await action(shopper, 'place', { item: 'hourglass' });
  await action(shopper, 'place', { item: 'miniGlobe' });
  const style = await action(shopper, 'place', { item: 'crystalTerrarium' });
  assert.deepEqual(style.profile.avatar, baseAvatar, 'gear should not overwrite the base avatar');
  assert.equal(style.profile.coins, 0);
  const worn = ['archiveVest', 'crystalTerrarium', 'hourglass', 'silverBraid'];
  assert.deepEqual(style.inventory.filter(entry => entry.placed).map(entry => entry.item).sort(), worn);
  assert.deepEqual(style.members.find(entry => entry.own).placed, worn);
  const off = await action(shopper, 'place', { item: 'archiveVest' });
  assert.equal(off.inventory.find(entry => entry.item === 'archiveVest').placed, false);
  assert.equal(off.inventory.find(entry => entry.item === 'auroraHood').placed, false);

  // Reactions use room-scoped desk references and only reach their recipient.
  const recipientState = await action(third, 'state');
  const recipientDesk = recipientState.members.find(member => member.own).desk_ref;
  const senderState = await action(first, 'state');
  const senderDesk = senderState.members.find(member => member.own).desk_ref;
  assert.equal((await action(first, 'react', { desk: senderDesk, kind: 'coffee' })).error, 'reactionUnavailable');
  const coffee = await action(first, 'react', { desk: recipientDesk, kind: 'coffee' });
  assert.equal(coffee.profile.coins, senderState.profile.coins);
  assert.deepEqual(coffee.reactions, []);
  assert.equal((await action(first, 'react', { desk: recipientDesk, kind: 'clap' })).error, 'reactionSlowDown');
  assert.equal((await action(third, 'state')).reactions[0].kind, 'coffee');
  assert.equal((await action(outsider, 'react', { desk: recipientDesk, kind: 'coffee' })).error, 'reactionUnavailable');
  assert.deepEqual((await action(outsider, 'state')).reactions, []);
  await db.query('update public.desk_reactions set created_ms=created_ms-13000 where from_user=$1', [first]);
  assert.deepEqual((await action(third, 'state')).reactions, []);
  const moved = await action(third, 'join', { room: 'archive' });
  assert.notEqual(moved.members.find(member => member.own).desk_ref, recipientDesk);
  assert.equal((await action(first, 'react', { desk: recipientDesk, kind: 'clap' })).error, 'reactionUnavailable');

  const ranker = users[4];
  const privateReader = users[5];
  const { rows: [midnight] } = await db.query(`
    select (extract(epoch from ((clock_timestamp() at time zone 'Europe/Istanbul')::date::timestamp
      at time zone 'Europe/Istanbul'))*1000)::bigint as start
  `);
  const today = Number(midnight.start);
  const day = 86400000;
  const history = async (who, when, duration, state = 'completed') => {
    await db.query('insert into public.sessions(user_id,start_ms,end_ms,state) values ($1,$2,$3,$4)',
      [who, when - duration * 60000, when, state]);
  };
  await history(ranker, today + 1000, 40);
  await history(ranker, today - day + 1000, 20);
  await history(ranker, today - 2 * day + 1000, 30);
  await history(ranker, today - 4 * day + 1000, 60);
  await history(ranker, today + 2000, 100, 'invalid');
  await history(privateReader, today + 3000, 120);
  const daily = await action(ranker, 'studySummary');
  assert.equal(daily.minutes, 40);
  assert.equal(daily.streak, 3);
  assert.equal((await action(ranker, 'leaderboard')).visible, false);
  await action(ranker, 'rankingVisibility', { visible: true });
  const table = await action(ranker, 'leaderboard');
  assert.equal(table.visible, true);
  assert.equal(table.rows.length, 1, 'the private reader must not appear in the ranking');
  assert.equal(table.own.rank, 1);
  assert.ok(table.own.minutes >= 40 && table.own.minutes <= 150);
  await action(ranker, 'rankingVisibility', { visible: false });
  assert.equal((await action(ranker, 'leaderboard')).rows.length, 0);

  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ranker]);
  for (const sql of [
    'update public.profiles set coins=999, leaderboard_visible=true',
    'update public.pets set xp=999',
    'update public.sessions set checks=999',
    'delete from public.coin_ledger',
    'select * from public.desk_reactions',
  ]) await assert.rejects(db.query(sql), /permission denied/);
  await db.exec('reset role');

  await db.query('delete from auth.users where id = $1', [first]);
  assert.equal((await action(third, 'state')).rooms.some(entry => entry.private), false);
  assert.equal((await action(third, 'join', { room: privateRoom.id })).error, 'inviteRequired');

  console.log('Postgres: migration, RLS, capacity, commerce, pause, verification, reward settlement, retry lease, private rooms, collections, group milestones, pets, wardrobe, chests, server timer, reactions, ranking, streak and account deletion passed.');
} finally {
  await db.close();
}
