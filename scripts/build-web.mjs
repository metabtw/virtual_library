import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privacyPage } from '../privacy-page.js';
import { termsPage } from '../terms-page.js';
import { addSiteVerification, featurePage } from '../feature-pages.js';
import { sitePages } from '../public/site-pages.js';
import { bundleFirebaseGoogle, bundleSupabase, getWebConfig, loadWebEnvironment, webFiles } from '../server.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function buildWeb(output, env = process.env) {
  const config = getWebConfig(env);
  if (!config) throw Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to publish the web app.');

  const [supabase, firebase] = await Promise.all([
    bundleSupabase(), config.firebaseGoogle ? bundleFirebaseGoogle() : undefined,
  ]);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const assets = [...webFiles.entries()].filter(([route]) => route !== '/account-deletion' && route !== '/');
  await Promise.all(assets.map(async ([route, [file]]) => {
    const target = resolve(output, route.slice(1));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, file), target);
  }));

  const pages = new Map([
    ['index.html', addSiteVerification(await readFile(resolve(root, 'public/index.html'), 'utf8'), env)],
    ['config.js', `export const config = ${JSON.stringify(config)};`],
    ['supabase-web.js', supabase],
    ['healthz.json', JSON.stringify({ ok: true })],
    ['privacy.html', privacyPage('tr', env)],
    ['privacy-en.html', privacyPage('en', env)],
    ['terms.html', termsPage('tr')],
    ['terms-en.html', termsPage('en')],
  ]);
  for (const path of Object.keys(sitePages)) {
    pages.set(path.slice(1) + '.html', featurePage(path, 'tr', config.analyticsId));
    pages.set(path.slice(1) + '-en.html', featurePage(path, 'en', config.analyticsId));
  }
  if (firebase) pages.set('firebase-google-sdk.js', firebase);
  await Promise.all([...pages].map(([name, content]) => writeFile(resolve(output, name), content)));
}

if (import.meta.main) {
  loadWebEnvironment();
  await buildWeb(resolve(root, 'dist/web'));
}
