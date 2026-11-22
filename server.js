import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { build } from 'esbuild';
import googleWeb from './google-web-config.json' with { type: 'json' };
import { privacyPage } from './privacy-page.js';

const root = dirname(fileURLToPath(import.meta.url));
const script = 'text/javascript; charset=utf-8';
const html = 'text/html; charset=utf-8';
const css = 'text/css; charset=utf-8';
const image = 'image/webp';
const audio = 'audio/mp4';
export const webFiles = new Map([
  ['/', ['public/index.html', html]],
  ['/account-deletion', ['public/index.html', html]],
  ['/styles.css', ['public/styles.css', css]],
  ['/room-preferences.css', ['public/room-preferences.css', css]],
  ['/app.js', ['public/app.js', script]],
  ['/google-sign-in.js', ['public/google-sign-in.js', script]],
  ['/avatar-art.js', ['public/avatar-art.js', script]],
  ['/prop-art.js', ['public/prop-art.js', script]],
  ['/sprites.js', ['public/sprites.js', script]],
  ['/web-social.js', ['public/web-social.js', script]],
  ['/web-strings.js', ['public/web-strings.js', script]],
  ['/strings.js', ['public/strings.js', script]],
  ['/room-preferences.js', ['public/room-preferences.js', script]],
  ['/library-client.js', ['public/library-client.js', script]],
  ['/focus-clock.js', ['public/focus-clock.js', script]],
  ['/desk-status.js', ['public/desk-status.js', script]],
  ['/study-rewards.js', ['public/study-rewards.js', script]],
  ['/community.js', ['public/community.js', script]],
  ['/room-social.js', ['public/room-social.js', script]],
  ['/library.webp', ['public/library.webp', image]],
  ['/aurora.webp', ['mobile/assets/aurora.webp', image]],
  ...['rain', 'garden', 'stars'].map(theme => [`/room-themes/${theme}.webp`, [`mobile/assets/themes/${theme}.webp`, image]]),
  ...['rain', 'fire', 'cafe', 'lofi', 'space', 'forest'].map(track =>
    [`/room-ambience/${track}.m4a`, [`mobile/assets/ambience/${track}.m4a`, audio]]),
]);

export function loadWebEnvironment() {
  for (const path of ['.env.local', 'mobile/.env.local']) {
    const file = resolve(root, path);
    if (existsSync(file)) loadEnvFile(file);
  }
}

function audioResponse(content, range) {
  const headers = { 'Accept-Ranges': 'bytes', 'Content-Length': content.length };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range ?? '');
  if (!match || (!match[1] && !match[2])) return { content, headers };

  const size = content.length;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (start >= size || end < start) {
    return { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 } };
  }
  return { status: 206, content: content.subarray(start, end + 1), headers: {
    ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1,
  } };
}

function publishable(key) {
  if (typeof key !== 'string') return false;
  if (/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) return true;
  // Legacy Supabase projects may use an anon JWT as their public key.
  if (!/^[-\w]+\.[-\w]+\.[-\w]+$/.test(key)) return false;
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';
  } catch {
    return false;
  }
}

export function getWebConfig(env = process.env) {
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  let url;
  try {
    url = new URL(env.EXPO_PUBLIC_SUPABASE_URL);
  } catch {
    return null;
  }
  if (!publishable(key) || url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    return null;
  }
  const paired = url.origin === googleWeb.supabaseOrigin;
  const google = env.WEB_AUTH_GOOGLE !== 'false' && (paired || env.WEB_AUTH_GOOGLE === 'true' || env.EXPO_PUBLIC_AUTH_GOOGLE === 'true');
  return { url: url.origin, key, google,
    ...(google && paired ? { firebaseGoogle: googleWeb.firebase } : {}),
    apple: env.EXPO_PUBLIC_AUTH_APPLE === 'true' };
}

async function bundleBrowserClient(contents) {
  const { outputFiles } = await build({
    stdin: { contents, resolveDir: root },
    bundle: true, write: false, platform: 'browser', format: 'esm', minify: true,
  });
  return outputFiles[0].contents;
}

export const bundleSupabase = () => bundleBrowserClient('export { createClient } from "@supabase/supabase-js";');
export const bundleFirebaseGoogle = () => bundleBrowserClient(`
  export { getApps, initializeApp } from 'firebase/app';
  export { browserPopupRedirectResolver, GoogleAuthProvider, initializeAuth, inMemoryPersistence,
    signInWithPopup, signOut } from 'firebase/auth';
`);

export function createWebServer({ config = getWebConfig(), bundle = new Uint8Array(), firebaseBundle, env = process.env } = {}) {
  return createServer(async (request, response) => {
    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    const write = (type, content, status = 200, extraHeaders) => response.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders,
    }).end(request.method === 'HEAD' ? undefined : content);
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (pathname === '/healthz') return write('application/json; charset=utf-8', JSON.stringify({ ok: Boolean(config) }), config ? 200 : 503);
      if (pathname === '/privacy') return write(html, privacyPage(searchParams.get('lang'), env));
      if (pathname === '/config.js') return write(script, `export const config = ${JSON.stringify(config)};`);
      if (pathname === '/supabase-web.js') return write(script, bundle);
      if (pathname === '/firebase-google-sdk.js' && config?.firebaseGoogle && firebaseBundle) return write(script, firebaseBundle);
      const file = webFiles.get(pathname);
      if (file) {
        try {
          const [path, type] = file;
          const content = await readFile(resolve(root, path));
          if (type === audio) {
            const media = audioResponse(content, request.method === 'GET' ? request.headers.range : undefined);
            return write(type, media.content, media.status, media.headers);
          }
          return write(type, content);
        } catch {
          response.writeHead(500).end();
          return;
        }
      }
    }
    response.writeHead(404).end();
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  loadWebEnvironment();
  const port = Number(process.env.PORT || 3000);
  const config = getWebConfig();
  const [bundle, firebaseBundle] = await Promise.all([bundleSupabase(), config?.firebaseGoogle ? bundleFirebaseGoogle() : undefined]);
  createWebServer({ config, bundle, firebaseBundle }).listen(port, '0.0.0.0', () => console.log(`Sanal Kütüphane :${port}`));
}
