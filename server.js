import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const script = 'text/javascript; charset=utf-8';
const html = 'text/html; charset=utf-8';
const files = new Map([
  ['/', ['public/index.html', html]],
  ['/account-deletion', ['public/index.html', html]],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['public/app.js', script]],
  ['/avatar-art.js', ['public/avatar-art.js', script]],
  ['/sprites.js', ['public/sprites.js', script]],
  ['/web-social.js', ['public/web-social.js', script]],
  ['/library-client.js', ['public/library-client.js', script]],
  ['/focus-clock.js', ['public/focus-clock.js', script]],
  ['/library.webp', ['public/library.webp', 'image/webp']],
  ['/aurora.webp', ['mobile/assets/aurora.webp', 'image/webp']],
]);

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
  return { url: url.origin, key, google: env.EXPO_PUBLIC_AUTH_GOOGLE === 'true', apple: env.EXPO_PUBLIC_AUTH_APPLE === 'true' };
}

export async function bundleSupabase() {
  const { outputFiles } = await build({
    stdin: { contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: root },
    bundle: true, write: false, platform: 'browser', format: 'esm', minify: true,
  });
  return outputFiles[0].contents;
}

export function createWebServer({ config = getWebConfig(), bundle = new Uint8Array() } = {}) {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const write = (type, content) => response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    }).end(request.method === 'HEAD' ? undefined : content);
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (pathname === '/config.js') return write(script, `export const config = ${JSON.stringify(config)};`);
      if (pathname === '/supabase-web.js') return write(script, bundle);
      const file = files.get(pathname);
      if (file) {
        try {
          return write(file[1], await readFile(resolve(root, file[0])));
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
  for (const path of ['.env.local', 'mobile/.env.local']) {
    const file = resolve(root, path);
    if (existsSync(file)) loadEnvFile(file);
  }
  const port = Number(process.env.PORT || 3000);
  createWebServer({ bundle: await bundleSupabase() }).listen(port, '0.0.0.0', () => console.log(`Sanal Kütüphane :${port}`));
}
