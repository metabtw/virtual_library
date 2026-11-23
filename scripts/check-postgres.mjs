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
  await db.query("update public.sessions set start_ms = start_ms - $2, end_ms = end_ms - $2 where user_id = $1 and state = 'active'", [id, milliseconds]);
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
    create table realtime.desk_events (payload jsonb, event text, topic text, private boolean);
    create function realtime.send(jsonb, text, text, boolean) returns void language sql
      as $$ insert into realtime.desk_events values ($1, $2, $3, $4) $$;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function realtime.topic() returns text language sql stable as $$ select 'room:night'::text $$;
    alter table realtime.messages enable row level security;
    grant usage on schema auth, realtime to authenticated;
    grant select, insert on realtime.messages to authenticated;
  `);
  const legacy = '00000000-0000-4000-a000-000000000099';
  let legacyProfile;
  for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) {
    if (file === '202611210008_avatars_and_pets.sql') {
      await db.query('insert into auth.users values ($1)', [legacy]);
      await action(legacy, 'profile', { name: 'Eski okur', gender: 'female', hair: 2, outfit: 1, color: '#789078' });
      await db.query(`insert into public.user_items (user_id, item, placed)
        select $1, id, true from public.items where id in ('cat','dragon','goldKeys','teaSet','plant','lamp')`, [legacy]);
    }
    if (file === '202611210014_profile_share_codes.sql') legacyProfile = (await action(legacy, 'state')).profile;
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
  }

  const migrated = await action(legacy, 'state');
  assert.equal(migrated.profile.avatar.hair, 2);
  assert.equal(migrated.profile.avatar.hair_style, null);
  assert.equal(migrated.profile.avatar.skin_tone, 0);
  assert.equal(migrated.profile.readerCode, legacyProfile.readerCode);
  assert.equal(migrated.profile.referralCode, legacyProfile.referralCode);
  assert.match(migrated.profile.shortReaderCode, /^SK-[23456789A-HJ-NP-Z]{5}$/);
  assert.match(migrated.profile.shortReferralCode, /^DV-[23456789A-HJ-NP-Z]{5}$/);
  assert.equal(migrated.inventory.length, 6);
  assert.deepEqual(migrated.inventory.filter(entry => entry.placed).map(entry => entry.item).sort(), ['cat', 'lamp', 'plant', 'teaSet']);

  const basic = { name: 'Yeni stil', gender: 'female', hair: 2, outfit: 1, color: '#789078' };
  const custom = { ...basic, hair_style: 6, outfit_style: 5, skin_tone: 4, hair_color: 2, beard: 1 };
  const styled = await action(legacy, 'profile', custom);
  assert.deepEqual(styled.profile.avatar, Object.fromEntries(Object.entries(custom).filter(([key]) => key !== 'name')));
  assert.equal(styled.profile.coins, 30);
  const legacyWrite = await action(legacy, 'profile', basic);
  assert.equal(legacyWrite.profile.avatar.hair_style, 6);
  assert.equal(legacyWrite.profile.avatar.skin_tone, 4);
  assert.equal((await action(legacy, 'profile', { ...custom, hair_style: 8 })).error, 'invalidAvatar');
  const reset = await action(legacy, 'profile', { ...basic, hair_style: null, outfit_style: null });
  assert.equal(reset.profile.avatar.hair_style, null);
  assert.equal(reset.profile.avatar.outfit_style, null);

  await action(legacy, 'join', { room: 'garden' });
  assert.equal((await action(legacy, 'buy', { item: 'pinkRabbit' })).profile.coins, 6);
  assert.equal((await action(legacy, 'buy', { item: 'yellowChick' })).error, 'insufficientCoins');
  await db.query('update public.profiles set coins = 40 where id = $1', [legacy]);
  assert.equal((await action(legacy, 'buy', { item: 'pugPup' })).error, 'boxOnly');
  await db.query("insert into public.user_items (user_id, item) values ($1, 'pugPup')", [legacy]);
  await db.query('update public.profiles set coins = 12 where id = $1', [legacy]);
  assert.equal((await action(legacy, 'buy', { item: 'yellowChick' })).profile.coins, 0);
  for (const animal of ['pinkRabbit', 'pugPup', 'yellowChick', 'dragon']) {
    const placed = await action(legacy, 'place', { item: animal });
    assert.deepEqual(placed.members.find(member => member.own).placed.sort(), [animal, 'lamp', 'plant', 'teaSet'].sort());
  }
  const capped = await action(legacy, 'place', { item: 'goldKeys' });
  assert.deepEqual(capped.members.find(member => member.own).placed, ['dragon', 'goldKeys', 'lamp', 'plant']);
  assert.equal(capped.inventory.length, 9);

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
  await assert.rejects(db.query("insert into realtime.messages values ('broadcast')"), /row-level security/);
  await db.query("insert into realtime.messages values ('presence')");
  await assert.rejects(settle());
  await db.exec('reset role');

  assert.equal((await action(first, 'buy', { item: 'plant' })).profile.coins, 10);
  assert.equal((await action(first, 'buy', { item: 'cat' })).error, 'insufficientCoins');
  assert.deepEqual((await action(first, 'place', { item: 'plant' })).members.find(member => member.own).placed, ['plant']);

  const begin = await action(first, 'start', { duration: 50 });
  assert.equal(begin.members.find(member => member.own).activity, 'working');
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
  const desk = resume.members.find(member => member.own).desk_ref;
  const { rows: updates } = await db.query("select payload, event, topic, private from realtime.desk_events where event = 'desk_status' order by ctid");
  assert.deepEqual(updates.map(({ payload: { at, ...payload }, ...event }) => {
    assert.ok(Number.isSafeInteger(at));
    return [payload, event];
  }), ['break', 'desk'].map(status => [{ desk, status }, { event: 'desk_status', topic: 'room:night', private: true }]));
  assert.deepEqual((await db.query("select payload->>'status' as activity from realtime.desk_events where event = 'desk_activity' order by ctid"))
    .rows.map(row => row.activity), ['working', 'break', 'working']);
  await shiftSession(first, 1231000);
  assert.equal(await settle(), 1);
  assert.equal((await action(first, 'verify')).error, 'verificationClosed');
  const invalid = await action(first, 'state');
  assert.equal(invalid.session.state, 'invalid');
  assert.equal(invalid.members.find(member => member.own).activity, 'missedCheck');
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
  await db.exec(`update public.reward_delivery set expo_ticket_id = 'ticket-fixture',
    next_attempt = clock_timestamp() - interval '1 second' where token = 'ExpoPushToken[example_first]'`);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from public.claim_focus_receipts()'), /permission denied/);
  await db.exec('set role service_role');
  assert.equal((await db.query('select * from public.claim_focus_rewards()')).rows.length, 0);
  const receipts = await db.query('select token, expo_ticket_id, attempts, receipt_attempts from public.claim_focus_receipts()');
  assert.deepEqual(receipts.rows, [{
    token: 'ExpoPushToken[example_first]', expo_ticket_id: 'ticket-fixture', attempts: 2, receipt_attempts: 1,
  }]);
  assert.equal((await db.query('select * from public.claim_focus_receipts()')).rows.length, 0);
  await db.exec('reset role');
  await db.query('delete from auth.users where id = $1', [second]);
  assert.equal((await db.query('select 1 from public.coin_ledger where user_id = $1', [second])).rows.length, 0);
  assert.equal((await db.query('select 1 from public.reward_delivery')).rows.length, 1);
  const outsider = users[9];
  assert.equal((await action(first, 'createRoom', { name: 'Başka Oda' })).error, 'leaveRoomFirst');
  await action(first, 'leave');
  const room = await action(first, 'createRoom', { name: 'Akşam Grubu' });
  const privateRoom = room.rooms.find(entry => entry.private);
  assert.equal(room.profile.coins, 0);
  assert.match(privateRoom.invite, /^\d{6}$/);
  assert.equal((await action(first, 'createRoom', { name: 'Yedek' })).error, 'privateRoomOwned');
  assert.equal((await action(outsider, 'state')).rooms.some(entry => entry.private), false);
  assert.equal((await action(outsider, 'join', { room: privateRoom.id })).error, 'inviteRequired');

  assert.equal((await action(third, 'joinCode', { code: privateRoom.invite })).error, 'leaveRoomFirst');
  await action(third, 'leave');
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
  const departed = users[4];
  await action(departed, 'leave');
  assert.equal((await action(departed, 'joinCode', { code: privateRoom.invite })).profile.room, privateRoom.id);
  await action(departed, 'leave');
  await db.query('insert into public.room_progress (room_id, minutes) values ($1,50)', [privateRoom.id]);
  await action(third, 'start', { duration: 50 });
  await shiftSession(third, 1200100);
  await action(third, 'verify');
  await shiftSession(third, 1200000);
  await action(third, 'verify');
  await shiftSession(third, 600000);
  assert.equal(await settle(), 1);
  assert.equal(await settle(), 0);
  const milestone = await action(third, 'state');
  assert.equal(milestone.rooms.find(entry => entry.id === privateRoom.id).minutes, 100);
  assert.deepEqual(milestone.pet, { xp: 1, upset: false });
  assert.equal(milestone.chests, 1);
  assert.equal((await action(first, 'state')).chests, 1);
  assert.equal((await action(outsider, 'state')).chests, 0);
  assert.equal((await action(departed, 'state')).chests, 0);

  const opening = await action(third, 'openChest');
  assert.equal(opening.chests, 0);
  assert.ok(milestone.boxes.find(box => box.id === 'basic').rewards.some(reward => reward.item === opening.drop.item));
  assert.equal((await action(third, 'openChest')).error, 'noChest');
  assert.equal((await action(third, 'openBox')).error, 'insufficientCoins');
  await db.query('update public.profiles set coins = 105 where id = $1', [third]);
  assert.equal((await action(third, 'buy', { item: 'neon' })).error, 'boxOnly');
  const box = await action(third, 'openBox');
  assert.equal(box.profile.coins, 30);
  assert.notEqual(box.drop.item, opening.drop.item);
  assert.equal((await action(third, 'buy', { item: 'space' })).profile.coins, 0);
  assert.equal((await action(third, 'place', { item: 'space' })).error, 'itemMissing');

  const shopper = users[3];
  const direct = {
    desk: ['deskCalendar', 'lamp', 'plant'],
    hair: ['midnightFade', 'mintBob', 'shortWaves'],
    wearable: ['denimJacket', 'linenShirt', 'sweater'],
    pet: ['cat', 'pinkRabbit', 'yellowChick'],
    ambience: ['forest', 'shore', 'space'],
  };
  const storefront = await action(shopper, 'state');
  const forSale = storefront.items.filter(entry => !entry.box_only);
  assert.equal(forSale.length, 15);
  for (const [category, ids] of Object.entries(direct)) {
    assert.deepEqual(forSale.filter(entry => entry.kind === category).map(entry => entry.id).sort(), ids);
  }
  const priceTotal = forSale.reduce((sum, item) => sum + item.price, 0);
  await db.query('update public.profiles set coins = $2 where id = $1', [shopper, priceTotal]);
  for (const { id } of forSale) {
    const purchase = await action(shopper, 'buy', { item: id });
    assert.ok(purchase.inventory.some(entry => entry.item === id && !entry.placed));
  }
  assert.equal((await action(shopper, 'state')).profile.coins, 0);
  assert.equal((await action(shopper, 'buy', { item: 'deskCalendar' })).error, 'itemOwned');
  const restricted = storefront.items.filter(entry => entry.box_only).map(entry => entry.id).sort();
  assert.deepEqual(storefront.boxes.map(box => [box.id, box.price, box.rewards.length]), [
    ['basic', 75, 23], ['epic', 140, 10], ['legendary', 230, 5],
  ]);
  assert.deepEqual(storefront.boxes.flatMap(box => box.rewards.map(reward => reward.item)).sort(), restricted);
  for (const room of ['rain-terrace', 'aurora-observatory', 'japanese-garden']) {
    assert.ok(storefront.rooms.some(entry => entry.id === room && entry.capacity === 9 && !entry.private));
  }
  for (const item of restricted) assert.equal((await action(shopper, 'buy', { item })).error, 'boxOnly');
  await db.query(`insert into public.user_items (user_id, item)
    select $1, unnest($2::text[]) on conflict do nothing`, [shopper, [
    'auroraHood', 'archiveVest', 'copperCurls', 'silverBraid', 'teaSet', 'hourglass', 'miniGlobe', 'crystalTerrarium',
    'autumnPoncho', 'starlightJacket', 'mossOveralls', 'lavenderBuns', 'mushroomLamp', 'foxMug', 'retroRadio', 'jellyTank', 'origamiCrane',
  ]]);
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

  for (const replacements of [
    ['auroraHood', 'autumnPoncho', 'starlightJacket', 'mossOveralls'],
    ['copperCurls', 'lavenderBuns', 'mintBob'],
    ['lamp', 'mushroomLamp'],
    ['teaSet', 'foxMug', 'retroRadio'],
    ['miniGlobe', 'jellyTank', 'origamiCrane'],
  ]) {
    let previous;
    for (const item of replacements) {
      const result = await action(shopper, 'place', { item });
      assert.ok(result.members.find(member => member.own).placed.includes(item), `${item} appears at the owner's desk`);
      if (previous) assert.equal(result.inventory.find(entry => entry.item === previous).placed, false);
      previous = item;
    }
  }
  const newStyle = await action(shopper, 'state');
  assert.deepEqual(newStyle.profile.avatar, baseAvatar);
  assert.equal(newStyle.profile.coins, 0);
  assert.deepEqual(newStyle.members.find(member => member.own).placed,
    ['mintBob', 'mossOveralls', 'mushroomLamp', 'origamiCrane', 'retroRadio']);

  await db.query('update public.profiles set coins = 5000 where id = $1', [shopper]);
  assert.equal((await action(shopper, 'openBox', { tier: ['epic'] })).error, 'invalidBox');
  assert.equal((await action(shopper, 'openBox', { tier: 'fake' })).error, 'invalidBox');
  assert.equal((await action(shopper, 'openBox', { tier: 'epic', price: 85 })).error, 'boxPriceChanged');
  const ownedBefore = new Set(newStyle.inventory.map(entry => entry.item));
  let balance = 5000;
  for (const offer of storefront.boxes) {
    const awarded = new Set();
    for (const reward of offer.rewards.filter(entry => !ownedBefore.has(entry.item))) {
      const result = await action(shopper, 'openBox', { tier: offer.id, price: offer.price });
      balance -= offer.price;
      assert.equal(result.profile.coins, balance);
      assert.ok(offer.rewards.some(entry => entry.item === result.drop.item));
      assert.ok(!ownedBefore.has(result.drop.item) && !awarded.has(result.drop.item), 'boxes must not award duplicate items');
      awarded.add(result.drop.item);
    }
    assert.equal((await action(shopper, 'openBox', { tier: offer.id })).error, 'collectionComplete');
    assert.equal((await action(shopper, 'state')).profile.coins, balance);
  }
  await db.query('insert into public.room_chests (room_id, milestone, user_id) values ($1, 999999, $2)', ['night', shopper]);
  const fallback = await action(shopper, 'openChest');
  assert.deepEqual(fallback.drop, { coins: 10 });
  assert.equal(fallback.profile.coins, balance + 10);
  const equipFox = await action(shopper, 'place', { item: 'arcticFox' });
  assert.ok(equipFox.inventory.some(entry => entry.item === 'arcticFox' && entry.placed));

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
  assert.equal((await action(third, 'join', { room: 'archive' })).error, 'leaveRoomFirst');
  await action(third, 'leave');
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

  const invitee = '00000000-0000-4000-a000-000000000100';
  const referredById = '00000000-0000-4000-a000-000000000101';
  const referredByLegacyCode = '00000000-0000-4000-a000-000000000102';
  await db.query('insert into auth.users values ($1), ($2), ($3)', [invitee, referredById, referredByLegacyCode]);
  const inviter = (await action(first, 'state')).profile;
  assert.match(inviter.readerCode, /^SK-[A-F0-9]{12}$/);
  assert.match(inviter.referralCode, /^DV-[A-F0-9]{12}$/);
  assert.equal((await action(invitee, 'profile', { ...basic, referral: 'WRONG' })).error, 'invalidReferral');
  assert.equal((await action(invitee, 'state')).profile, null);
  const registration = await action(invitee, 'profile', { ...basic, name: 'Davetli', referral: ` ${inviter.shortReferralCode.toLowerCase()} ` });
  assert.equal(registration.profile.coins, 35);
  assert.match(registration.profile.shortReaderCode, /^SK-[23456789A-HJ-NP-Z]{5}$/);
  assert.notEqual(registration.profile.shortReaderCode, inviter.shortReaderCode);
  assert.equal((await action(referredById, 'profile', { ...basic, referral: inviter.shortReaderCode })).profile.coins, 35);
  assert.equal((await action(referredByLegacyCode, 'profile', { ...basic, referral: inviter.referralCode })).profile.coins, 35);
  const updated = await action(invitee, 'profile', { ...basic, name: 'Davetli', referral: inviter.referralCode });
  assert.equal(updated.profile.coins, 35);
  assert.equal(updated.profile.shortReaderCode, registration.profile.shortReaderCode);
  assert.equal(updated.profile.shortReferralCode, registration.profile.shortReferralCode);
  assert.equal((await action(first, 'state')).profile.coins, inviter.coins + 30);

  assert.equal((await action(invitee, 'addFriend', { code: registration.profile.shortReaderCode })).error, 'friendMissing');
  assert.equal((await action(invitee, 'addFriend', { code: inviter.shortReferralCode })).error, 'friendMissing');
  const sent = await action(invitee, 'addFriend', { code: inviter.shortReaderCode.toLowerCase() });
  assert.equal(sent.friends.length, 1);
  assert.equal(sent.friends[0].shortCode, inviter.shortReaderCode);
  assert.equal(sent.friends[0].code, inviter.readerCode);
  const relation = sent.friends[0].id;
  assert.equal((await action(invitee, 'addFriend', { code: inviter.readerCode })).friends[0].id, relation);
  assert.equal(sent.friends[0].status, 'sent');
  assert.equal((await action(invitee, 'inviteFriend', { id: relation })).error, 'friendMissing');
  assert.equal((await action(outsider, 'answerFriend', { id: relation, answer: 'accept' })).error, 'friendMissing');
  assert.equal((await action(first, 'state')).friends[0].status, 'incoming');
  assert.equal((await action(first, 'answerFriend', { id: relation, answer: 'accept' })).friends[0].status, 'accepted');
  const invitationSent = await action(first, 'inviteFriend', { id: relation });
  assert.ok(invitationSent.friends[0].inviteRetryAt >= invitationSent.now + 59900);
  assert.equal((await action(first, 'inviteFriend', { id: relation })).error, 'studyInviteCooldown');
  const study = (await action(invitee, 'state')).studyInvites[0];
  assert.equal(study.private, true);
  assert.ok(study.expiresAt > invitationSent.friends[0].inviteRetryAt);
  assert.equal((await action(outsider, 'answerStudyInvite', { id: study.id, answer: 'accept' })).error, 'studyInviteMissing');
  assert.equal((await action(invitee, 'join', { room: privateRoom.id })).error, 'inviteRequired');
  const accepted = await action(invitee, 'answerStudyInvite', { id: study.id, answer: 'accept' });
  assert.equal(accepted.joinedInvite, true);
  assert.equal(accepted.profile.room, privateRoom.id);
  assert.equal(accepted.studyInvites.length, 0);
  assert.equal(accepted.friends[0].inRoom, true);
  assert.equal((await action(first, 'inviteFriend', { id: relation })).error, 'friendInRoom');
  assert.equal((await action(invitee, 'answerStudyInvite', { id: study.id, answer: 'accept' })).error, 'studyInviteMissing');

  for (const [minutes, expectedCoins] of [[30, 41], [60, 52], [90, 58], [120, 74]]) {
    await action(invitee, 'start', { duration: 30 });
    assert.equal((await action(invitee, 'inviteFriend', { id: relation })).error, 'working');
    await shiftSession(invitee, 1200100);
    assert.equal((await action(invitee, 'verify')).session.checks, 1);
    await shiftSession(invitee, 600000);
    const complete = await action(invitee, 'state');
    assert.equal(complete.dailyQuests.minutes, minutes);
    assert.deepEqual(complete.dailyQuests.goals.map(goal => goal.completed), [minutes >= 60, minutes >= 120]);
    assert.equal(complete.profile.coins, expectedCoins);
    assert.equal((await action(invitee, 'state')).profile.coins, expectedCoins);
  }

  const weeklyReader = '00000000-0000-4000-a000-000000000103';
  await db.query('insert into auth.users values ($1)', [weeklyReader]);
  await action(weeklyReader, 'profile', basic);
  await db.query(`insert into public.sessions (user_id, start_ms, end_ms, state)
    select $1, (extract(epoch from completed) - minutes * 60) * 1000, extract(epoch from completed) * 1000, state
    from (values ('2024-01-01 00:00:00+03'::timestamptz, 150, 'completed'),
      ('2024-01-02 21:00:00+03'::timestamptz, 150, 'completed'),
      ('2024-01-04 21:00:00+03'::timestamptz, 150, 'completed'),
      ('2024-01-07 23:59:59+03'::timestamptz, 150, 'completed'),
      ('2024-01-08 00:00:00+03'::timestamptz, 20, 'completed'),
      ('2024-01-06 21:00:00+03'::timestamptz, 180, 'invalid')) as records(completed, minutes, state)`, [weeklyReader]);
  const weeklyFor = async monday => (await db.query('select public.weekly_focus_quests($1, $2) as quests', [weeklyReader, monday])).rows[0].quests;
  for (let attempt = 0; attempt < 2; attempt++) {
    const week = await weeklyFor('2024-01-01');
    assert.equal(week.end, '2024-01-08');
    assert.deepEqual(week.goals.map(goal => [goal.target, goal.progress, goal.coins, goal.completed]),
      [[300, 600, 15, true], [600, 600, 30, true], [4, 4, 15, true], [7, 2, 45, false]]);
    assert.equal((await action(weeklyReader, 'state')).profile.coins, 90);
  }
  assert.deepEqual((await weeklyFor('2024-01-08')).goals.map(goal => [goal.progress, goal.completed]),
    [[20, false], [20, false], [0, false], [0, false]]);
  await db.query(`insert into public.sessions (user_id, start_ms, end_ms, state)
    select $1, (extract(epoch from completed) - minutes * 60) * 1000, extract(epoch from completed) * 1000, 'completed'
    from (values ('2024-01-03 21:00:00+03'::timestamptz, 30),
      ('2024-01-05 21:00:00+03'::timestamptz, 29),
      ('2024-01-06 22:00:00+03'::timestamptz, 30)) as records(completed, minutes)`, [weeklyReader]);
  const streak = async () => (await weeklyFor('2024-01-01')).goals.find(goal => goal.id === 'streak-7');
  assert.deepEqual([ (await streak()).progress, (await streak()).completed ], [4, false]);
  await db.query(`insert into public.sessions (user_id, start_ms, end_ms)
    values ($1, extract(epoch from '2024-01-05 21:10:00+03'::timestamptz) * 1000,
      extract(epoch from '2024-01-05 21:11:00+03'::timestamptz) * 1000)`, [weeklyReader]);
  await db.query("update public.sessions set state = 'completed' where user_id = $1 and state = 'active'", [weeklyReader]);
  assert.deepEqual([ (await streak()).progress, (await streak()).completed ], [7, true]);
  assert.equal((await action(weeklyReader, 'state')).profile.coins, 135);

  const openAd = async (network = 'web', placement = 'web') =>
    (await db.query('select public.open_rewarded_ad($1,$2,$3) as result', [invitee, network, placement])).rows[0].result;
  const creditAd = async (id, transaction, unit = 'web') =>
    (await db.query("select public.credit_rewarded_ad($1,'web',$2,$3, clock_timestamp()) as ok", [id, unit, transaction])).rows[0].ok;
  const attempts = [];
  for (const [index, wait] of [10, 20, 40, 40].entries()) {
    const { attempt } = await openAd();
    attempts.push(attempt);
    assert.equal((await openAd()).attempt, attempt);
    assert.equal(await creditAd(attempt, 'wrong-unit', 'wrong'), false);
    if (index) assert.equal(await creditAd(attempt, 'watch-0'), false);
    assert.equal(await creditAd(attempt, 'watch-' + index), true);
    assert.equal(await creditAd(attempt, 'watch-' + index), true, 'duplicate provider callback is acknowledged');
    assert.equal((await action(invitee, 'state')).profile.coins, 74 + (index + 1) * 5);
    assert.equal((await openAd('admob', '1234567890')).error, 'adCooldown');
    const { rows: [{ wait_minutes }] } = await db.query(
      'select (extract(epoch from retry_at - rewarded_at) / 60)::int as wait_minutes from public.rewarded_ad_attempts where id = $1', [attempt]);
    assert.equal(wait_minutes, wait);
    await db.query("update public.rewarded_ad_attempts set retry_at = clock_timestamp() - interval '1 second' where id = $1", [attempt]);
  }
  assert.equal(new Set(attempts).size, 4);
  await action(invitee, 'leave');
  assert.equal((await action(first, 'inviteFriend', { id: relation })).error, 'studyInviteCooldown');
  await db.query('update public.study_invite_limits set retry_ms = public.library_time_ms() - 1 where sender = $1', [first]);
  assert.ok(!(await action(first, 'inviteFriend', { id: relation })).error);
  assert.equal((await action(invitee, 'removeFriend', { id: relation })).friends.length, 0);

  const phone = { clientId: 'mobile-fixture', generation: 0 };
  const tab = { clientId: 'browser-fixture', generation: 0 };
  const lifecycleActor = referredByLegacyCode;
  await action(lifecycleActor, 'join', { ...phone, room: 'garden' });
  assert.deepEqual(await action(lifecycleActor, 'roomPresence', { ...phone, generation: 1, room: 'garden', mode: 'background' }), { ok: true });
  const away = () => action(legacy, 'state').then(result => result.members.find(member => !member.own && member.name === basic.name)?.activity);
  assert.match(await away(), /^away(Reels|Sleep|Busy)$/);
  await action(lifecycleActor, 'state', phone);
  assert.match(await away(), /^away(Reels|Sleep|Busy)$/, 'an older heartbeat may not erase the away tag');
  await action(lifecycleActor, 'state', tab);
  assert.equal(await away(), 'desk');
  await action(lifecycleActor, 'roomPresence', { ...tab, generation: 1, room: 'garden', mode: 'disconnect' });
  assert.match(await away(), /^away(Reels|Sleep|Busy)$/, 'closing one tab leaves the other connection');
  await action(lifecycleActor, 'state', { ...phone, generation: 2 });
  await action(lifecycleActor, 'roomPresence', { ...phone, generation: 1, room: 'garden', mode: 'background' });
  assert.equal(await away(), 'desk', 'an older background signal may not hide a resumed connection');
  await action(lifecycleActor, 'start', { ...phone, generation: 2, duration: 50 });
  await action(lifecycleActor, 'roomPresence', { ...phone, generation: 3, room: 'garden', mode: 'disconnect' });
  const disconnected = await action(lifecycleActor, 'state', phone);
  assert.equal(disconnected.profile.room, null);
  assert.equal(disconnected.session.state, 'invalid');

  await action(privateReader, 'leave');
  const opened = await action(privateReader, 'createRoom', { name: 'Geçici Oda' });
  const temporary = opened.rooms.find(entry => entry.owned);
  await action(lifecycleActor, 'joinCode', { ...phone, code: temporary.invite });
  assert.equal((await action(privateReader, 'leave')).privateRoomClosing, false);
  assert.equal((await db.query('select empty_since_ms from public.rooms where id = $1', [temporary.id])).rows[0].empty_since_ms, null);
  await action(lifecycleActor, 'roomPresence', { ...phone, generation: 1, room: temporary.id, mode: 'background' });
  await db.query('update public.room_connections set expires_ms = public.library_time_ms() - 1000 where user_id = $1', [lifecycleActor]);
  await db.query('update public.room_members set seen = public.library_time_ms() - 16000 where user_id = $1', [lifecycleActor]);
  await settle();
  assert.equal((await action(lifecycleActor, 'state', phone)).profile.room, null);
  assert.ok((await db.query('select empty_since_ms from public.rooms where id = $1', [temporary.id])).rows[0].empty_since_ms);
  assert.equal((await action(privateReader, 'createRoom', { name: 'İkinci Oda' })).error, 'privateRoomOwned');
  await db.query('update public.rooms set empty_since_ms = public.library_time_ms() - 43199000 where id = $1', [temporary.id]);
  assert.equal((await action(privateReader, 'join', { room: temporary.id })).profile.room, temporary.id);
  assert.equal((await db.query('select empty_since_ms from public.rooms where id = $1', [temporary.id])).rows[0].empty_since_ms, null);
  assert.equal((await action(privateReader, 'leave')).privateRoomClosing, true);
  await db.query('update public.rooms set empty_since_ms = public.library_time_ms() - 43201000 where id = $1', [temporary.id]);
  assert.equal((await action(privateReader, 'join', { room: temporary.id })).error, 'inviteRequired');
  assert.equal((await action(privateReader, 'state')).profile.ownsPrivateRoom, false);
  assert.equal((await action(lifecycleActor, 'joinCode', { code: temporary.invite })).error, 'invalidInvite');
  const replacement = (await action(privateReader, 'createRoom', { name: 'Yeni Oda' })).rooms.find(entry => entry.owned);
  await db.query('update public.room_members set seen = public.library_time_ms() - 16000 where user_id = $1', [privateReader]);
  await db.query('update public.rooms set empty_since_ms = public.library_time_ms() - 42000000 where id = $1', [replacement.id]);
  assert.equal((await action(privateReader, 'state')).profile.room, replacement.id);
  assert.equal((await db.query('select empty_since_ms from public.rooms where id = $1', [replacement.id])).rows[0].empty_since_ms, null);
  await action(privateReader, 'leave');
  await db.query('update public.rooms set empty_since_ms = public.library_time_ms() - 43201000 where id = $1', [replacement.id]);
  await settle();
  assert.equal((await action(privateReader, 'state')).profile.ownsPrivateRoom, false);

  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ranker]);
  for (const sql of [
    'update public.profiles set coins=999, leaderboard_visible=true',
    'update public.pets set xp=999',
    'update public.sessions set checks=999',
    'delete from public.coin_ledger',
    'select * from public.desk_reactions',
    'select * from public.reader_referrals',
    'select * from public.profile_share_codes',
    'select * from public.reader_friendships',
    'select * from public.study_invites',
    'select * from public.study_invite_limits',
    'select * from public.room_connections',
    'select * from public.rewarded_ad_attempts',
    "select public.open_rewarded_ad(null,'web','web')",
    "select public.credit_rewarded_ad(null,'web','web','fake',now())",
  ]) await assert.rejects(db.query(sql), /permission denied/);
  await db.exec('reset role');

  await db.query('delete from auth.users where id = $1', [first]);
  assert.equal((await db.query('select count(*)::int as count from public.profile_share_codes where profile_id = $1', [first])).rows[0].count, 0);
  assert.equal((await action(third, 'state')).rooms.some(entry => entry.private), false);
  await action(third, 'leave');
  assert.equal((await action(third, 'join', { room: privateRoom.id })).error, 'inviteRequired');
  const closedRoom = (await db.query('select owner_id, name, name_en from public.rooms where id = $1', [privateRoom.id])).rows[0];
  assert.deepEqual(closedRoom, { owner_id: null, name: 'Kapalı özel oda', name_en: 'Closed private room' });

  console.log('Postgres: rooms, activity, RLS, focus, coins, daily quests, chests, profile codes, referrals, friends, study invites, signed-ad settlement, push leases, shop, pets, ranking and account deletion passed.');
} finally {
  await db.close();
}
