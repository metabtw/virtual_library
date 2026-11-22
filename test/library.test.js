import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { bundleFirebaseGoogle, bundleSupabase, createWebServer, getWebConfig } from '../server.js';
import googleWeb from '../google-web-config.json' with { type: 'json' };
import { focusRemaining, markServerTime, serverTimeAt, verificationRemaining } from '../public/focus-clock.js';
import { displayDeskStatuses, recordDeskStatus } from '../public/desk-status.js';
import { invokeLibrary } from '../public/library-client.js';
import { writingSize } from '../public/avatar-art.js';
import { writingFrames } from '../public/sprites.js';
import { createRoomPreferences, resolveRoomTheme } from '../public/room-preferences.js';

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
  for (const path of ['/', '/account-deletion', '/library-client.js', '/focus-clock.js', '/web-social.js', '/web-strings.js',
    '/strings.js', '/desk-status.js', '/study-rewards.js', '/community.js', '/prop-art.js', '/library.webp',
    '/room-preferences.js', '/room-preferences.css', '/room-themes/rain.webp', '/room-themes/garden.webp', '/room-themes/stars.webp']) {
    const response = await fetch(address + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
});

test('readiness and both privacy notice languages are public routes', async t => {
  const env = {
    PRIVACY_CONTROLLER_NAME: 'School & Library',
    PRIVACY_CONTACT_EMAIL: 'privacy@example.test',
    PRIVACY_DETAILS_TR: 'Saklama süresi',
    PRIVACY_DETAILS_EN: 'Retention < 90 days',
  };
  const address = await fixture(t, { config: { url: publicUrl, key: publishable }, env });
  const ready = await fetch(address + '/healthz');
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { ok: true });
  const unconfigured = await fixture(t, { config: null, env: {} });
  assert.equal((await fetch(unconfigured + '/healthz')).status, 503);
  assert.match(await (await fetch(unconfigured + '/privacy')).text(), /Bu taslak/u);
  const tr = await (await fetch(address + '/privacy')).text();
  assert.match(tr, /Saklama süresi/u);
  assert.match(tr, /href="\/\?lang=tr#profile".*Geri dön/u);
  const en = await (await fetch(address + '/privacy?lang=en')).text();
  assert.match(en, /<html lang="en">/);
  assert.match(en, /School &amp; Library/);
  assert.match(en, /Retention &lt; 90 days/);
  assert.match(en, /href="\/\?lang=en#profile".*Go back/);
  assert.match(en, /class="[^"]*account-danger" href="\/account-deletion\?lang=en"/);
  assert.doesNotMatch(en, /completes this draft/);
});

test('serves the shared ambience tracks and supports media byte ranges', async t => {
  const address = await fixture(t);
  for (const track of ['rain', 'fire', 'cafe', 'lofi', 'space', 'forest']) {
    const response = await fetch(`${address}/room-ambience/${track}.m4a`, { method: 'HEAD' });
    assert.equal(response.status, 200, track);
    assert.equal(response.headers.get('Content-Type'), 'audio/mp4');
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
    assert.ok(Number(response.headers.get('Content-Length')) > 1000);
  }
  const source = address + '/room-ambience/rain.m4a';
  const ranged = await fetch(source, { headers: { Range: 'bytes=0-1' } });
  assert.equal(ranged.status, 206);
  assert.match(ranged.headers.get('Content-Range'), /^bytes 0-1\/\d+$/);
  assert.equal((await ranged.arrayBuffer()).byteLength, 2);
  const unavailable = await fetch(source, { headers: { Range: 'bytes=9999999999-' } });
  assert.equal(unavailable.status, 416);
  assert.match(unavailable.headers.get('Content-Range'), /^bytes \*\/\d+$/);
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

test('enables paired Firebase Google web sign-in independently of the Expo flag', async t => {
  const env = { EXPO_PUBLIC_SUPABASE_URL: googleWeb.supabaseOrigin, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
    EXPO_PUBLIC_AUTH_GOOGLE: 'false' };
  const config = getWebConfig(env);
  assert.equal(config.google, true);
  assert.deepEqual(Object.keys(config.firebaseGoogle).sort(), ['apiKey', 'appId', 'authDomain', 'projectId']);
  const disabled = getWebConfig({ ...env, WEB_AUTH_GOOGLE: 'false' });
  assert.equal(disabled.google, false);
  assert.equal(disabled.firebaseGoogle, undefined);

  const directOAuth = getWebConfig({ ...env, EXPO_PUBLIC_SUPABASE_URL: publicUrl, EXPO_PUBLIC_AUTH_GOOGLE: 'true' });
  assert.equal(directOAuth.google, true);
  assert.equal(directOAuth.firebaseGoogle, undefined);

  const firebaseBundle = await bundleFirebaseGoogle();
  assert.ok(firebaseBundle.byteLength > 1000);
  const address = await fixture(t, { config, firebaseBundle });
  const response = await fetch(address + '/firebase-google-sdk.js');
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, firebaseBundle.byteLength);
  const alternate = await fixture(t, { config: directOAuth });
  assert.equal((await fetch(alternate + '/firebase-google-sdk.js')).status, 404);
});

test('signup and sign-in email templates both deliver a one-time code', async () => {
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const html = await readFile(new URL('../supabase/templates/sign-in-code.html', import.meta.url), 'utf8');
  for (const template of ['confirmation', 'magic_link']) {
    const section = config.split(`[auth.email.template.${template}]`)[1]?.split('\n[')[0];
    assert.match(section, /content_path = "\.\/supabase\/templates\/sign-in-code\.html"/);
  }
  assert.match(html, /\{\{ \.Token \}\}/);
  assert.doesNotMatch(html, /\{\{ .*ConfirmationURL/);
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

test('a desk update appears immediately and a newer snapshot takes precedence', () => {
  const own = { own: true, desk_ref: 'local', status: 'desk' };
  const peer = { own: false, desk_ref: 'remote', status: 'desk' };
  let updates = recordDeskStatus(new Map(), { desk: peer.desk_ref, status: 'break', at: 3000 });
  updates = recordDeskStatus(updates, { desk: own.desk_ref, status: 'break', at: 3000 });
  const stale = recordDeskStatus(updates, { desk: peer.desk_ref, status: 'desk', at: 2500 });
  assert.equal(stale, updates);
  assert.equal(recordDeskStatus(updates, { desk: peer.desk_ref, status: 'unknown', at: 4000 }), updates);
  assert.deepEqual(displayDeskStatuses([own, peer], 1000, updates), [{ ...own, status: 'break' }, { ...peer, status: 'break' }]);
  assert.deepEqual(displayDeskStatuses([own, peer], 4000, updates), [own, peer]);
  const working = recordDeskStatus(updates, { desk: peer.desk_ref, status: 'working', at: 5000 });
  assert.deepEqual(displayDeskStatuses([peer], 4000, working), [{ ...peer, activity: 'working' }]);
});

test('auto themes follow the room and unlocked milestone until the user chooses a theme', () => {
  assert.equal(resolveRoomTheme('auto', { id: 'night' }), 'classic');
  assert.equal(resolveRoomTheme('auto', { id: 'garden' }), 'garden');
  assert.equal(resolveRoomTheme('auto', { id: 'archive' }), 'stars');
  assert.equal(resolveRoomTheme('auto', { id: 'night', minutes: 99 }), 'classic');
  assert.equal(resolveRoomTheme('auto', { id: 'night', minutes: 100 }), 'aurora');
  assert.equal(resolveRoomTheme('rain', { id: 'night', minutes: 100 }), 'rain');
  const preferences = createRoomPreferences({ storage: () => ({ getItem: () => '{"theme":"garden"}' }) });
  assert.equal(preferences.themeFor({ id: 'night' }), 'garden');
});

test('ambience mixes saved levels, enables only owned packs, and stops when leaving', t => {
  const players = new Map();
  const storage = () => ({ getItem: () => '{"volumes":{"rain":1,"lofi":3,"space":2,"forest":2}}' });
  const createAudio = t.mock.fn(source => {
    const player = {
      paused: true,
      play() { this.paused = false; return Promise.resolve(); },
      pause() { this.paused = true; },
    };
    players.set(source, player);
    return player;
  });
  const preferences = createRoomPreferences({ storage, createAudio });
  const room = { id: 'night' };
  assert.match(preferences.markup(room, []), /Uzay İstasyonu · Mağazada açılır/);
  preferences.sync(room, []);
  assert.deepEqual([...players.keys()], ['/room-ambience/rain.m4a', '/room-ambience/lofi.m4a']);
  assert.equal(players.get('/room-ambience/rain.m4a').volume, 0.16);
  assert.equal(players.get('/room-ambience/lofi.m4a').volume, 0.48);
  assert.ok([...players.values()].every(player => player.loop && !player.paused));
  preferences.sync(room, [{ item: 'space', placed: false }]);
  assert.equal(createAudio.mock.callCount(), 3);
  assert.equal(players.get('/room-ambience/space.m4a').volume, 0.32);
  preferences.sync(null);
  assert.ok([...players.values()].every(player => player.paused));
});

test('ambience shows a play button after an autoplay rejection and retries on click', async () => {
  let attempts = 0;
  const player = {
    paused: true,
    play() {
      attempts++;
      if (attempts === 1) return Promise.reject(new Error('playback blocked'));
      this.paused = false;
      return Promise.resolve();
    },
  };
  const preferences = createRoomPreferences({
    storage: () => ({ getItem: () => '{"volumes":{"rain":1}}' }), createAudio: () => player,
  });
  const handlers = new Map();
  const notice = {};
  const play = {};
  preferences.attach({
    addEventListener: (type, handler) => handlers.set(type, handler),
    querySelector: selector => selector === '[data-ambience-notice]' ? notice : play,
  }, () => false);
  preferences.sync({ id: 'night' });
  await Promise.resolve();
  assert.equal(play.hidden, false);
  assert.match(notice.textContent, /yeniden başlatmak/i);
  handlers.get('click')({ target: { closest: selector => selector === '[data-play-ambience]' ? play : null } });
  assert.equal(attempts, 2);
  assert.equal(player.paused, false);
  assert.equal(play.hidden, true);
});

test('web writing uses a cached pixel strip with distinct frames', t => {
  const frames = Array.from({ length: writingSize.frames }, () => []);
  const brush = {
    fillStyle: '',
    fillRect(x, y, width, height) {
      const frame = Math.floor(x / writingSize.width);
      frames[frame].push([this.fillStyle, x % writingSize.width, y, width, height]);
    },
  };
  const canvas = {
    getContext: () => brush,
    toDataURL: t.mock.fn(() => 'data:image/png;base64,stub'),
  };
  const createElement = t.mock.fn(() => canvas);
  globalThis.document = { createElement };
  t.after(() => { delete globalThis.document; });
  assert.equal(writingFrames(), canvas.toDataURL.mock.calls[0].result);
  assert.equal(writingFrames(), canvas.toDataURL.mock.calls[0].result);
  assert.equal(createElement.mock.callCount(), 1);
  assert.equal(canvas.toDataURL.mock.callCount(), 1);
  assert.equal(canvas.width, writingSize.width * writingSize.frames);
  assert.equal(canvas.height, writingSize.height);
  assert.equal(new Set(frames.map(frame => JSON.stringify(frame))).size, writingSize.frames);
});
