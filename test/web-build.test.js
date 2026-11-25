import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildWeb } from '../scripts/build-web.mjs';
import { getWebConfig } from '../server.js';
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
    GA_MEASUREMENT_ID: 'G-INTEGRATION01',
    GOOGLE_SITE_VERIFICATION: 'test_google-123',
    BING_SITE_VERIFICATION: 'TESTBING1234',
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
    analyticsId: env.GA_MEASUREMENT_ID,
    firebaseGoogle: googleWeb.firebase,
    apple: false,
  });
  assert.ok((await stat(file('firebase-google-sdk.js'))).size > 1000);
  assert.ok((await stat(file('room-ambience/rain.m4a'))).size > 1000);
  assert.match(await read('index.html'), /src="\/app\.js"/);
  assert.match(await read('index.html'), /rel="canonical" href="https:\/\/virtualstudycrew\.com\/"/);
  assert.match(await read('robots.txt'), /Sitemap: https:\/\/virtualstudycrew\.com\/sitemap\.xml/);
  assert.match(await read('sitemap.xml'), /<loc>https:\/\/virtualstudycrew\.com\/<\/loc>/);
  const index = await read('index.html');
  assert.match(index, /name="google-site-verification" content="test_google-123"/);
  assert.match(index, /name="msvalidate.01" content="TESTBING1234"/);
  assert.doesNotMatch(index, /googletagmanager[.]com/);
  const sitemap = await read('sitemap.xml');
  const urls = ['odalar', 'odak-zamanlayici', 'oyunlar'];
  const titles = new Set();
  const descriptions = new Set();
  for (const path of urls) {
    const canonical = 'https://virtualstudycrew.com/' + path;
    assert.ok(sitemap.includes('<loc>' + canonical + '</loc>'));
    const feature = await read(path + '.html');
    assert.ok(feature.includes('rel="canonical" href="' + canonical + '"'));
    assert.match(feature, /metrics[.]page/);
    titles.add(feature.match(/<title>([^<]+)<\/title>/)[1]);
    descriptions.add(feature.match(/name="description" content="([^"]+)"/)[1]);
    const english = await read(path + '-en.html');
    assert.ok(english.includes('lang="en"'));
    assert.ok(english.includes('rel="canonical" href="' + canonical + '?lang=en"'));
  }
  assert.equal(titles.size, urls.length);
  assert.equal(descriptions.size, urls.length);
  for (const name of ['favicon.png', 'app-logo.png', 'apple-touch-icon.png', 'study-room-preview.jpg']) {
    assert.ok((await stat(file(name))).size > 0);
  }
  assert.ok(vercel.headers.some(rule => rule.source === '/account-deletion' &&
    rule.headers.some(header => header.key === 'X-Robots-Tag' && header.value === 'noindex')));
  assert.match(await read('privacy.html'), /<html lang="tr">/);
  assert.match(await read('privacy-en.html'), /Retention &lt; 30 days/);
  assert.match(await read('terms.html'), /Kullanım koşulları/u);
  assert.match(await read('terms-en.html'), /Terms of service/);
  assert.deepEqual(JSON.parse(await read('healthz.json')), { ok: true });
  for (const { destination } of vercel.rewrites) {
    if (destination.startsWith('https://')) continue;
    assert.ok((await stat(file(destination.slice(1)))).isFile());
  }
  assert.ok(vercel.rewrites.some(rule => rule.source === '/__/auth/:path*' &&
    rule.destination === `https://${googleWeb.firebase.authDomain}/__/auth/:path*`));
  assert.equal(getWebConfig({
    ...env, WEB_FIREBASE_CUSTOM_AUTH_DOMAIN: 'virtualstudycrew.com',
  }).firebaseGoogle.authDomain, googleWeb.firebase.authDomain);
  assert.equal(getWebConfig({ ...env, WEB_FIREBASE_AUTH_REDIRECT_URI: 'https://virtualstudycrew.com/__/auth/handler' }).firebaseGoogleDomain,
    undefined);

  await buildWeb(output, {
    ...env, WEB_AUTH_GOOGLE: 'false', GOOGLE_SITE_VERIFICATION: '<script>', GA_MEASUREMENT_ID: 'not-an-id',
  });
  assert.doesNotMatch(await read('index.html'), /name="google-site-verification"/);
  assert.doesNotMatch(await read('config.js'), /analyticsId/);
  await assert.rejects(stat(file('firebase-google-sdk.js')), { code: 'ENOENT' });
  await assert.rejects(buildWeb(output, { ...env, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }),
    /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});
