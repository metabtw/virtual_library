import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { bundleSupabase, createWebServer, getWebConfig } from '../server.js';
import { focusRemaining, markServerTime, serverTimeAt, verificationRemaining } from '../public/focus-clock.js';
import { invokeLibrary } from '../public/library-client.js';

const publicUrl = 'https://project.supabase.co';
const publishable = 'sb_publishable_unit_test';

async function fixture(t, options) {
  const server = createWebServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

test('serves the web app, public deletion route, shared client and artwork', async t => {
  const address = await fixture(t);
  for (const path of ['/', '/account-deletion', '/library-client.js', '/focus-clock.js', '/web-social.js', '/library.webp']) {
    const response = await fetch(address + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
});

test('web server exposes only the public config and does not own game mutations', async t => {
  const config = getWebConfig({ EXPO_PUBLIC_SUPABASE_URL: publicUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable });
  const address = await fixture(t, { config });
  const response = await fetch(address + '/config.js');
  assert.match(await response.text(), /sb_publishable_unit_test/);
  for (const path of ['/api/state', '/.env.local', '/supabase/config.toml', '/.data/library.sqlite']) {
    const missing = await fetch(address + path);
    assert.equal(missing.status, 404);
  }
  const oldWrite = await fetch(address + '/api/buy', { method: 'POST' });
  assert.equal(oldWrite.status, 404);
});

test('browser runtime refuses Supabase service keys and unsafe project origins', () => {
  const token = role => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.sig';
  const config = (key, url = publicUrl) => getWebConfig({
    EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  });
  assert.equal(config('sb_secret_private'), null);
  assert.equal(config(token('service_role')), null);
  assert.equal(config(publishable, 'https://user:pass@project.supabase.co'), null);
  assert.equal(config(publishable, 'http://project.supabase.co'), null);
  assert.equal(config(token('anon')).key, token('anon'));
});

test('bundles the official Supabase browser client', async t => {
  const bundle = await bundleSupabase();
  assert.ok(bundle.byteLength > 1000);
  const address = await fixture(t, { bundle });
  assert.equal((await (await fetch(address + '/supabase-web.js')).arrayBuffer()).byteLength, bundle.byteLength);
});

test('common client sends the same command to the library Edge Function', async () => {
  const data = { profile: { coins: 30 }, now: 1000 };
  const client = { functions: { invoke: async (name, options) => {
    assert.equal(name, 'library');
    assert.deepEqual(options.body, { action: 'start', payload: { duration: 50 } });
    return { data, error: null };
  } } };
  assert.deepEqual(await invokeLibrary(client, 'start', { duration: 50 }), data);
});

test('common client preserves safe RPC errors and authenticated HTTP failures', async () => {
  const client = value => ({ functions: { invoke: async () => value } });
  for (const [value, message] of [
    [{ data: { error: 'insufficientCoins' } }, 'insufficientCoins'],
    [{ data: null, error: { context: Response.json({ error: 'unauthorized' }) } }, 'unauthorized'],
    [{ data: null, error: new Error('network') }, 'server'],
  ]) await assert.rejects(invokeLibrary(client(value), 'buy'), { message });
});

test('focus display catches up after suspended callbacks and freezes during a pause', () => {
  const clock = markServerTime(1000);
  const observed = serverTimeAt(clock, clock.receivedMonotonic + 90000);
  assert.equal(observed, 91000);
  assert.equal(focusRemaining({ end: 120000, paused_at: null }, observed), 29000);
  assert.equal(focusRemaining({ end: 120000, paused_at: 60000 }, observed), 60000);
});

test('the verification modal uses the server-provided window boundaries', () => {
  const session = { state: 'active', next_check_at: 10000, check_until: 40000 };
  assert.equal(verificationRemaining(session, 9999), 0);
  assert.equal(verificationRemaining(session, 10000), 30000);
  assert.equal(verificationRemaining(session, 39999), 1);
  assert.equal(verificationRemaining(session, 40000), 0);
  assert.equal(verificationRemaining({ ...session, state: 'invalid' }, 12000), 0);
  assert.equal(verificationRemaining({ state: 'active' }, 12000), 0);
});
