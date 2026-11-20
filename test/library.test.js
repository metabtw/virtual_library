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
  for (const path of ['/', '/app.js', '/styles.css', '/library.webp']) {
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
  assert.equal((await api('state')).profile.coins, 10);
  assert.equal((await api('state')).profile.coins, 10);
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
  assert.equal((await api('state')).profile.coins, 0);
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
