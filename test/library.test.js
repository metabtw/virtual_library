import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createLibrary } from '../server.js';

const minute = 60_000;
const avatar = { hair: 0, outfit: 0, color: '#bd7050' };

async function fixture(t) {
  let now = 100_000;
  const server = createLibrary({ clock: () => now });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const client = () => {
    let cookie;
    return async (action, data, expected = 200) => {
      const headers = cookie ? { Cookie: cookie } : {};
      if (data) headers['Content-Type'] = 'application/json';
      const response = await fetch(origin + '/api/' + action, {
        method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined,
      });
      const token = response.headers.get('set-cookie');
      if (token) cookie = token.split(';')[0];
      const result = await response.json();
      assert.equal(response.status, expected, JSON.stringify(result));
      return result;
    };
  };
  return { client, advance: value => { now += value; }, origin };
}

test('serves the application and room illustration', async t => {
  const { origin } = await fixture(t);
  for (const path of ['/', '/app.js', '/sprites.js', '/styles.css', '/library.webp']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
});

test('a verified 50-minute session awards 10 coins once and permits one purchase', async t => {
  const { client, advance } = await fixture(t);
  const api = client();
  await api('profile', { ...avatar, name: 'Ada' });
  await api('join', { room: 'night' });
  await api('start', { duration: 50 });
  await api('verify', {}, 400);
  advance(20 * minute);
  await api('verify', {});
  await api('verify', {}, 400);
  advance(20 * minute);
  await api('verify', {});
  advance(10 * minute);
  assert.equal((await api('state')).profile.coins, 40);
  assert.equal((await api('state')).profile.coins, 40);
  await api('buy', { item: 'cat' });
  await api('buy', { item: 'plant' }, 400);
  const bought = await api('buy', { item: 'lamp' });
  assert.equal(bought.profile.coins, 0);
  await api('buy', { item: 'lamp' }, 400);
  assert.deepEqual((await api('place', { item: 'lamp' })).members[0].placed, ['lamp']);
});

test('missing a verification by exactly 30 seconds invalidates the session', async t => {
  const { client, advance } = await fixture(t);
  const api = client();
  await api('profile', { ...avatar, name: 'Ada' });
  await api('join', { room: 'night' });
  await api('start', { duration: 25 });
  advance(20 * minute + 30_000);
  await api('verify', {}, 400);
  assert.equal((await api('state')).session.state, 'invalid');
  advance(5 * minute);
  assert.equal((await api('state')).profile.coins, 30);
});

test('isolated clients see room status and the server rejects a thirteenth member', async t => {
  const { client } = await fixture(t);
  const clients = Array.from({ length: 13 }, client);
  for (const [index, api] of clients.entries()) {
    await api('profile', { ...avatar, name: 'Okur ' + index });
    await api('join', { room: 'night' }, index < 12 ? 200 : 400);
  }
  await clients[0]('status', { status: 'break' });
  const observer = await clients[1]('state');
  assert.equal(observer.members.length, 12);
  assert.equal(observer.members[0].status, 'break');
  assert.equal(observer.members[0].own, false);
  await clients[0]('leave', {});
  assert.equal((await clients[12]('join', { room: 'night' })).members.length, 12);
});

test('mola freezes focus time and only running sessions lock other actions', async t => {
  const { client, advance } = await fixture(t);
  const api = client();
  assert.equal((await api('profile', { ...avatar, name: 'Ada' })).profile.coins, 30);
  assert.equal((await api('profile', { ...avatar, name: 'Ada 2' })).profile.coins, 30);
  await api('join', { room: 'night' });
  const started = await api('start', { duration: 25 });
  await api('buy', { item: 'lamp' }, 400);
  await api('join', { room: 'garden' }, 400);
  await api('leave', {}, 400);
  await api('profile', { ...avatar, name: 'Ada 3' }, 400);
  advance(18 * minute);
  const paused = await api('status', { status: 'break' });
  assert.equal(paused.session.end - paused.session.paused_at, 7 * minute);
  advance(60 * minute);
  assert.equal((await api('state')).session.paused_at, paused.session.paused_at);
  await api('buy', { item: 'lamp' });
  const resumed = await api('status', { status: 'desk' });
  assert.equal(resumed.session.paused_at, null);
  assert.equal(resumed.session.end, started.session.end + 60 * minute);
  await api('verify', {}, 400);
  advance(2 * minute);
  await api('verify', {});
  advance(5 * minute);
  assert.equal((await api('state')).profile.coins, 25);
});

test('pausing or resuming during an open verification does not extend its deadline', async t => {
  const { client, advance } = await fixture(t);
  const api = client();
  await api('profile', { ...avatar, name: 'Ada' });
  await api('join', { room: 'night' });
  await api('start', { duration: 25 });
  advance(20 * minute + 10_000);
  await api('status', { status: 'break' });
  advance(10_000);
  await api('status', { status: 'desk' });
  advance(10_000);
  assert.equal((await api('state')).session.state, 'invalid');
});

test('custom focus durations are validated and timed by the server', async t => {
  const { client, advance } = await fixture(t);
  const api = client();
  await api('profile', { ...avatar, name: 'Ada' });
  await api('join', { room: 'night' });
  for (const duration of [4, 181, 7.5, '7']) {
    await api('start', { duration }, 400);
  }
  const { session } = await api('start', { duration: 7 });
  assert.equal(session.end - session.start, 7 * minute);
  advance(7 * minute);
  const completed = await api('state');
  assert.equal(completed.session.state, 'completed');
  assert.equal(completed.profile.coins, 31);
});

test('avatar gender is optional, validated and visible to room members', async t => {
  const { client } = await fixture(t);
  const ada = client();
  const observer = client();
  assert.equal((await ada('profile', { ...avatar, name: 'Ada' })).profile.avatar.gender, 'unspecified');
  await ada('profile', { ...avatar, name: 'Ada', gender: 'female' });
  await ada('profile', { ...avatar, name: 'Ada 2', gender: 'invalid' }, 400);
  assert.equal((await ada('profile', { ...avatar, name: 'Ada' })).profile.avatar.gender, 'female');
  await ada('join', { room: 'night' });
  await observer('profile', { ...avatar, name: 'Efe', gender: 'male' });
  const room = await observer('join', { room: 'night' });
  assert.deepEqual(room.members.map(member => member.avatar.gender), ['female', 'male']);
});

test('Google Sign-In creates/restores profile across browsers, links guest profile, and protects PII', async t => {
  let now = 100_000;
  const tokens = {
    'token-ada': { uid: 'google-uid-ada', email: 'ada@example.com', emailVerified: true, name: 'Ada Lovelace' },
    'token-unverified': { uid: 'google-uid-bad', email: 'spoof@example.com', emailVerified: false, name: 'Spoof' },
    'token-efe': { uid: 'google-uid-efe', email: 'efe@example.com', emailVerified: true, name: 'Efe Kaya' },
  };
  const server = createLibrary({
    clock: () => now,
    firebaseConfig: { apiKey: 'pub-key', authDomain: 'test.firebaseapp.com', projectId: 'test-proj', appId: '1:1:web:1' },
    verifyIdToken: async (idToken) => {
      if (!tokens[idToken]) throw new Error('Invalid token');
      return tokens[idToken];
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;

  const client = () => {
    const jar = new Map();
    return async (action, data, expected = 200) => {
      const cookieHeader = Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      const headers = cookieHeader ? { Cookie: cookieHeader } : {};
      if (data) headers['Content-Type'] = 'application/json';
      const response = await fetch(origin + '/api/' + action, {
        method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined,
      });
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(';');
        const eq = pair.indexOf('=');
        const name = pair.slice(0, eq);
        const val = pair.slice(eq + 1);
        if (!val) jar.delete(name);
        else jar.set(name, val);
      }
      const result = await response.json();
      assert.equal(response.status, expected, JSON.stringify(result));
      return result;
    };
  };

  const configRes = await fetch(origin + '/api/auth/config');
  const config = await configRes.json();
  assert.equal(config.enabled, true);
  assert.equal(config.projectId, 'test-proj');

  const browser1 = client();
  // Unverified email is rejected
  await browser1('auth/google', { idToken: 'token-unverified' }, 400);

  // Sign in with Google before creating avatar
  const signedIn = await browser1('auth/google', { idToken: 'token-ada' });
  assert.equal(signedIn.auth.signedIn, true);
  assert.equal(signedIn.auth.email, 'ada@example.com');
  assert.equal(signedIn.profile, null);

  // Create profile while signed in -> linked to Google account
  const created = await browser1('profile', { ...avatar, name: 'Ada' });
  assert.equal(created.profile.googleLinked, true);
  assert.equal(created.profile.email, 'ada@example.com');
  await browser1('buy', { item: 'lamp' });
  await browser1('join', { room: 'night' });

  // Second browser signs in with the same Google account -> restores Ada's profile, coins, and inventory
  const browser2 = client();
  const restored = await browser2('auth/google', { idToken: 'token-ada' });
  assert.equal(restored.profile.name, 'Ada');
  assert.equal(restored.profile.coins, 20);
  assert.deepEqual(restored.inventory.map(i => i.item), ['lamp']);

  // Another user (guest first, then links Google) joins same room -> never sees Ada's email
  const efeClient = client();
  await efeClient('profile', { ...avatar, name: 'Efe' });
  await efeClient('buy', { item: 'plant' });
  const linkedEfe = await efeClient('auth/google', { idToken: 'token-efe' });
  assert.equal(linkedEfe.profile.googleLinked, true);
  assert.equal(linkedEfe.profile.coins, 10);
  const roomView = await efeClient('join', { room: 'night' });
  const adaMember = roomView.members.find(m => m.name === 'Ada');
  assert.equal(adaMember.email, undefined);
  assert.equal(adaMember.google_uid, undefined);

  // Logout is blocked during active focus session, succeeds after break
  await efeClient('start', { duration: 25 });
  await efeClient('auth/logout', {}, 400);
  await efeClient('status', { status: 'break' });
  const loggedOut = await efeClient('auth/logout', {});
  assert.equal(loggedOut.auth.signedIn, false);
  assert.equal(loggedOut.profile, null);
});

