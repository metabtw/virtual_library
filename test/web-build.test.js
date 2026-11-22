import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildWeb } from '../scripts/build-web.mjs';
import googleWeb from '../google-web-config.json' with { type: 'json' };
import vercel from '../vercel.json' with { type: 'json' };

test('builds the static Vercel site and keeps browser configuration public', async t => {
  const output = await mkdtemp(join(tmpdir(), 'library-web-build-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: googleWeb.supabaseOrigin,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_build_test',
    SUPABASE_ACCESS_TOKEN: 'private-admin-value',
    PRIVACY_DETAILS_EN: 'Retention < 30 days',
  };
  await buildWeb(output, env);
  const file = name => join(output, name);
  const read = name => readFile(file(name), 'utf8');
  const configScript = await read('config.js');
  assert.doesNotMatch(configScript, /private-admin-value/);
  assert.match(configScript, /export const config = /);
  assert.deepEqual(JSON.parse(configScript.slice('export const config = '.length, -1)), {
    url: googleWeb.supabaseOrigin,
    key: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    google: true,
    firebaseGoogle: googleWeb.firebase,
    apple: false,
  });
  assert.ok((await stat(file('firebase-google-sdk.js'))).size > 1000);
  assert.ok((await stat(file('room-ambience/rain.m4a'))).size > 1000);
  assert.match(await read('index.html'), /src="\/app\.js"/);
  assert.match(await read('index.html'), /rel="canonical" href="https:\/\/virtualstudycrew\.com\/"/);
  assert.match(await read('robots.txt'), /Sitemap: https:\/\/virtualstudycrew\.com\/sitemap\.xml/);
  assert.match(await read('sitemap.xml'), /<loc>https:\/\/virtualstudycrew\.com\/<\/loc>/);
  for (const name of ['favicon.png', 'apple-touch-icon.png', 'study-room-preview.jpg']) {
    assert.ok((await stat(file(name))).size > 0);
  }
  assert.ok(vercel.headers.some(rule => rule.source === '/account-deletion' &&
    rule.headers.some(header => header.key === 'X-Robots-Tag' && header.value === 'noindex')));
  assert.match(await read('privacy.html'), /<html lang="tr">/);
  assert.match(await read('privacy-en.html'), /Retention &lt; 30 days/);
  assert.deepEqual(JSON.parse(await read('healthz.json')), { ok: true });
  for (const { destination } of vercel.rewrites) {
    assert.ok((await stat(file(destination.slice(1)))).isFile());
  }

  await buildWeb(output, { ...env, WEB_AUTH_GOOGLE: 'false' });
  await assert.rejects(stat(file('firebase-google-sdk.js')), { code: 'ENOENT' });
  await assert.rejects(buildWeb(output, { ...env, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }),
    /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});
