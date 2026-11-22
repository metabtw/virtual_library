import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error(`Sanal Kütüphane için Node.js 22 veya üzeri gerekir. Yüklü sürüm: ${process.version}.`);
  process.exit(1);
}

const { DatabaseSync } = await import('node:sqlite');

const rooms = [
  { id: 'night', name: 'Gece Kuşları Kütüphanesi', icon: '☾', detail: 'Gece boyunca sessizce odaklan.' },
  { id: 'garden', name: 'Cam Bahçe', icon: '❧', detail: 'Yeşilliklerin arasında bir çalışma molası.' },
  { id: 'archive', name: 'Eski Arşiv', icon: '▤', detail: 'Kitapların arasında yerini al.' },
];

const items = [
  { id: 'lamp', icon: '🏮', name: 'Masa Lambası', price: 10, detail: 'Masana sıcak bir ışık kat.' },
  { id: 'plant', icon: '🪴', name: 'Monstera', price: 20, detail: 'Çalışma köşene biraz yeşillik.' },
  { id: 'cat', icon: '🐈', name: 'Gezgin Kedi', price: 30, detail: 'Sessiz bir çalışma arkadaşı.' },
  { id: 'sweater', icon: '🧥', name: 'Turuncu Kazak', price: 20, detail: 'Avatarına sıcak bir kıyafet.' },
];

const minute = 60_000;
const interval = 20 * minute;
const windowMs = 30_000;
const activeMs = 15_000;
const startingCoins = 30;
const colors = ['#bd7050', '#789078', '#7988ab', '#ad7963'];

function loadFirebaseConfig() {
  const configUrl = new URL('./firebase-applet-config.json', import.meta.url);
  if (!existsSync(configUrl)) return null;
  try {
    const config = JSON.parse(readFileSync(configUrl, 'utf8'));
    if (!config?.projectId || config.projectId === 'remixed-project-id') return null;
    return config;
  } catch {
    return null;
  }
}

function createFirebaseVerifier(firebaseConfig) {
  if (!firebaseConfig?.projectId) return null;
  const app = getApps().length
    ? getApp()
    : initializeApp({ projectId: firebaseConfig.projectId });
  const adminAuth = getAdminAuth(app);
  return async (idToken) => {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email || null,
      emailVerified: Boolean(decoded.email_verified),
      name: decoded.name || null,
    };
  };
}

export function createLibrary({
  database = ':memory:',
  clock = Date.now,
  firebaseConfig = loadFirebaseConfig(),
  verifyIdToken,
} = {}) {
  const verifyToken = verifyIdToken ?? createFirebaseVerifier(firebaseConfig);
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL,
      room TEXT, status TEXT DEFAULT 'desk', seen INTEGER NOT NULL,
      coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
      google_uid TEXT, email TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user TEXT REFERENCES profiles(id), start INTEGER NOT NULL,
      end INTEGER NOT NULL, checks INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active',
      paused_at INTEGER, verification_due INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions(user) WHERE state = 'active';
    CREATE TABLE IF NOT EXISTS coin_ledger (
      reference TEXT PRIMARY KEY, user TEXT REFERENCES profiles(id), amount INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_items (
      user TEXT REFERENCES profiles(id), item TEXT NOT NULL, placed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user, item)
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY, google_uid TEXT NOT NULL, email TEXT, display_name TEXT, created_at INTEGER NOT NULL
    );
  `);

  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = (work) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  transaction(() => {
    const sessionColumns = new Set(all('PRAGMA table_info(sessions)').map(column => column.name));
    for (const column of ['paused_at', 'verification_due']) {
      if (!sessionColumns.has(column)) db.exec(`ALTER TABLE sessions ADD COLUMN ${column} INTEGER`);
    }
    const profileColumns = new Set(all('PRAGMA table_info(profiles)').map(column => column.name));
    for (const column of ['google_uid', 'email']) {
      if (!profileColumns.has(column)) db.exec(`ALTER TABLE profiles ADD COLUMN ${column} TEXT`);
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS profiles_google_uid ON profiles(google_uid) WHERE google_uid IS NOT NULL');
  });

  const active = (id) => get("SELECT * FROM sessions WHERE user = ? AND state = 'active'", id);
  const nextCheck = (session) => session.verification_due ??
    (session.paused_at === null ? session.start + interval * (session.checks + 1) : Infinity);
  const settle = (id, now) => {
    const session = active(id);
    if (!session) return;
    const next = nextCheck(session);
    if (next < session.end && now >= next + windowMs) {
      run("UPDATE sessions SET state = 'invalid' WHERE id = ?", session.id);
    } else if (session.paused_at === null && now >= session.end) {
      const reward = Math.floor((session.end - session.start) / (5 * minute));
      run("UPDATE sessions SET state = 'completed' WHERE id = ?", session.id);
      run('INSERT INTO coin_ledger VALUES (?, ?, ?)', session.id, id, reward);
      run('UPDATE profiles SET coins = coins + ? WHERE id = ?', reward, id);
    }
  };
  const inventory = (id) => all('SELECT item, placed FROM user_items WHERE user = ?', id);
  const readAvatar = (json) => ({ gender: 'unspecified', ...JSON.parse(json) });
  const state = (id, now, authSession) => {
    const profile = id && get('SELECT name, avatar, room, status, coins, google_uid, email FROM profiles WHERE id = ?', id);
    if (profile) {
      profile.avatar = readAvatar(profile.avatar);
      profile.googleLinked = Boolean(profile.google_uid);
      delete profile.google_uid;
    }
    const session = id && get('SELECT start, end, checks, state, paused_at, verification_due FROM sessions WHERE user = ? ORDER BY rowid DESC LIMIT 1', id);
    const counts = all('SELECT room, count(*) AS total FROM profiles WHERE seen > ? GROUP BY room', now - activeMs);
    const members = profile?.room ? all('SELECT id, name, avatar, status FROM profiles WHERE room = ? AND seen > ? ORDER BY rowid', profile.room, now - activeMs) : [];
    return {
      now,
      profile,
      session,
      items,
      inventory: id ? inventory(id) : [],
      auth: {
        enabled: Boolean(verifyToken || firebaseConfig),
        signedIn: Boolean(authSession || profile?.googleLinked),
        email: authSession?.email || profile?.email || null,
        displayName: authSession?.display_name || null,
      },
      rooms: rooms.map(room => ({ ...room, count: counts.find(row => row.room === room.id)?.total ?? 0 })),
      members: members.map(member => ({
        ...member,
        own: member.id === id,
        id: undefined,
        avatar: readAvatar(member.avatar),
        placed: inventory(member.id).filter(item => item.placed).map(item => item.item),
      })),
    };
  };
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const saveAvatar = (input, previous) => {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const gender = input.gender === undefined
      ? (previous ? readAvatar(previous).gender : 'unspecified')
      : input.gender;
    require(name.length >= 2 && name.length <= 24, 'Kullanıcı adı 2–24 karakter olmalı.');
    require(['female', 'male', 'unspecified'].includes(gender), 'Geçerli bir cinsiyet seç.');
    require([0, 1, 2].includes(input.hair) && [0, 1, 2].includes(input.outfit) && colors.includes(input.color), 'Avatar parçalarını seç.');
    return [name, JSON.stringify({ gender, hair: input.hair, outfit: input.outfit, color: input.color })];
  };

  function dispatch(id, action, input, { authToken, googleUser } = {}) {
    return transaction(() => {
      const now = clock();
      let profile = id && get('SELECT * FROM profiles WHERE id = ?', id);
      if (!profile) id = null;
      let authSession = authToken && get('SELECT * FROM auth_sessions WHERE token = ?', authToken);
      if (!authSession && profile?.google_uid) {
        authSession = { google_uid: profile.google_uid, email: profile.email, display_name: null };
      }
      if (id) settle(id, now);
      const current = id && active(id);

      if (action === 'auth/logout') {
        require(current?.paused_at !== null, 'Diğer işlemler için önce mola ver.');
        if (authToken) run('DELETE FROM auth_sessions WHERE token = ?', authToken);
        return { id: null, authToken: null, clearCookies: true, data: state(null, now, null) };
      }

      if (action === 'auth/google') {
        require(googleUser && typeof googleUser.uid === 'string' && googleUser.uid.length > 0, 'Google oturumu doğrulanamadı.');
        require(!googleUser.email || googleUser.emailVerified, 'Doğrulanmış bir Google hesabı ile giriş yap.');
        const existingByGoogle = get('SELECT * FROM profiles WHERE google_uid = ?', googleUser.uid);
        if (current?.paused_at === null && (!existingByGoogle || existingByGoogle.id !== id)) {
          require(!profile?.google_uid || profile.google_uid === googleUser.uid, 'Diğer işlemler için önce mola ver.');
          if (existingByGoogle && existingByGoogle.id !== id) require(false, 'Diğer işlemler için önce mola ver.');
        }
        if (existingByGoogle) {
          if (current?.paused_at === null && existingByGoogle.id !== id) {
            require(false, 'Diğer işlemler için önce mola ver.');
          }
          id = existingByGoogle.id;
          run('UPDATE profiles SET email = COALESCE(?, email), seen = ? WHERE id = ?', googleUser.email, now, id);
        } else if (profile && !profile.google_uid) {
          run('UPDATE profiles SET google_uid = ?, email = ?, seen = ? WHERE id = ?', googleUser.uid, googleUser.email, now, id);
        } else if (profile && profile.google_uid && profile.google_uid !== googleUser.uid) {
          require(current?.paused_at !== null, 'Diğer işlemler için önce mola ver.');
          id = null;
        }
        if (authToken) run('DELETE FROM auth_sessions WHERE token = ?', authToken);
        const newAuthToken = randomUUID();
        run(
          'INSERT INTO auth_sessions (token, google_uid, email, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
          newAuthToken,
          googleUser.uid,
          googleUser.email,
          googleUser.name,
          now
        );
        const savedAuth = get('SELECT * FROM auth_sessions WHERE token = ?', newAuthToken);
        return { id, authToken: newAuthToken, data: state(id, now, savedAuth) };
      }

      if (current?.paused_at === null) {
        require(['state', 'status', 'verify'].includes(action), 'Diğer işlemler için önce mola ver.');
      }
      if (action === 'profile') {
        const [name, avatar] = saveAvatar(input, profile?.avatar);
        if (id) run('UPDATE profiles SET name = ?, avatar = ? WHERE id = ?', name, avatar, id);
        else {
          const existingGoogle = authSession && get('SELECT * FROM profiles WHERE google_uid = ?', authSession.google_uid);
          if (existingGoogle) {
            id = existingGoogle.id;
            run('UPDATE profiles SET name = ?, avatar = ?, seen = ? WHERE id = ?', name, avatar, now, id);
          } else {
            id = randomUUID();
            run(
              'INSERT INTO profiles (id, name, avatar, seen, coins, google_uid, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
              id,
              name,
              avatar,
              now,
              startingCoins,
              authSession?.google_uid || null,
              authSession?.email || null
            );
            run('INSERT INTO coin_ledger VALUES (?, ?, ?)', 'welcome:' + id, id, startingCoins);
          }
        }
      } else if (action !== 'state') {
        require(profile, 'Önce avatarını oluştur.');
      }
      if (id) {
        if (action === 'join' || (profile?.room && profile.seen <= now - activeMs)) {
          const destination = action === 'join' ? input.room : profile.room;
          require(rooms.some(room => room.id === destination), 'Oda bulunamadı.');
          const count = get('SELECT count(*) AS total FROM profiles WHERE room = ? AND id <> ? AND seen > ?', destination, id, now - activeMs).total;
          if (action === 'join') require(count < 12, 'Bu oda dolu.');
          run('UPDATE profiles SET room = ? WHERE id = ?', count < 12 ? destination : null, id);
        }
        if (action === 'leave') run('UPDATE profiles SET room = NULL WHERE id = ?', id);
        if (action === 'status') {
          require(['desk', 'break'].includes(input.status), 'Durum geçersiz.');
          if (current && input.status === 'break' && current.paused_at === null) {
            const due = nextCheck(current);
            run('UPDATE sessions SET paused_at = ?, verification_due = ? WHERE id = ?', now, due < current.end && due <= now ? due : null, current.id);
          }
          if (current?.paused_at != null && input.status === 'desk') {
            require(get('SELECT room FROM profiles WHERE id = ?', id).room, 'Devam etmek için bir odaya katıl.');
            const pauseLength = now - current.paused_at;
            run('UPDATE sessions SET start = start + ?, end = end + ?, paused_at = NULL WHERE id = ?', pauseLength, pauseLength, current.id);
          }
          run('UPDATE profiles SET status = ? WHERE id = ?', input.status, id);
        }
        if (action === 'start') {
          profile = get('SELECT * FROM profiles WHERE id = ?', id);
          require(profile.room && !active(id), 'Bu periyot başlatılamadı.');
          require(Number.isInteger(input.duration) && input.duration >= 5 && input.duration <= 180, 'Periyot süresi 5–180 dakika arasında tam sayı olmalı.');
          run('INSERT INTO sessions (id, user, start, end) VALUES (?, ?, ?, ?)', randomUUID(), id, now, now + input.duration * minute);
          run("UPDATE profiles SET status = 'desk' WHERE id = ?", id);
        }
        if (action === 'verify') {
          const session = active(id);
          const next = session && nextCheck(session);
          require(session && next < session.end && now >= next && now < next + windowMs, 'Doğrulama penceresi kapalı.');
          run('UPDATE sessions SET checks = checks + 1, verification_due = NULL WHERE id = ?', session.id);
        }
        if (action === 'buy' || action === 'place') {
          const item = items.find(candidate => candidate.id === input.item);
          require(item, 'Eşya bulunamadı.');
          if (action === 'buy') {
            require(!get('SELECT 1 FROM user_items WHERE user = ? AND item = ?', id, item.id), 'Bu eşya zaten sende.');
            require(run('UPDATE profiles SET coins = coins - ? WHERE id = ? AND coins >= ?', item.price, id, item.price).changes, 'Yeterli jetonun yok.');
            run('INSERT INTO user_items (user, item) VALUES (?, ?)', id, item.id);
            run('INSERT INTO coin_ledger VALUES (?, ?, ?)', randomUUID(), id, -item.price);
          } else {
            require(run('UPDATE user_items SET placed = 1 - placed WHERE user = ? AND item = ?', id, item.id).changes, 'Bu eşya envanterinde yok.');
          }
        }
        run('UPDATE profiles SET seen = ? WHERE id = ?', now, id);
      }
      return { id, authToken, data: state(id, now, authSession) };
    });
  }

  const actions = new Set(['state', 'profile', 'join', 'leave', 'status', 'start', 'verify', 'buy', 'place']);
  const publicFiles = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/sprites.js': ['sprites.js', 'text/javascript; charset=utf-8'],
    '/library.webp': ['library.webp', 'image/webp'],
    '/vendor/firebase-auth.js': ['vendor/firebase-auth.js', 'text/javascript; charset=utf-8'],
  };

  function cookieAttributes(req, maxAge = 2592000) {
    const isHttps = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https';
    const sameSite = isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax';
    return `Path=/; HttpOnly; ${sameSite}; Max-Age=${maxAge}`;
  }

  function validOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (!host) return true;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const readCookie = (req, name) =>
    req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9-]{36})(?:;|$)`))?.[1];

  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;

    if (path === '/api/auth/config' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (!firebaseConfig) {
        res.end(JSON.stringify({ enabled: false }));
        return;
      }
      res.end(JSON.stringify({
        enabled: true,
        apiKey: firebaseConfig.apiKey,
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        appId: firebaseConfig.appId,
        messagingSenderId: firebaseConfig.messagingSenderId,
        storageBucket: firebaseConfig.storageBucket,
      }));
      return;
    }

    const action = path.startsWith('/api/') ? path.slice(5) : '';
    const isAuthPost = (action === 'auth/google' || action === 'auth/logout') && req.method === 'POST';
    if ((actions.has(action) && req.method === (action === 'state' ? 'GET' : 'POST')) || isAuthPost) {
      if (req.method === 'POST') {
        if (!validOrigin(req)) {
          res.writeHead(403).end();
          return;
        }
        if (req.headers['content-type'] !== 'application/json') {
          res.writeHead(415).end();
          return;
        }
      }
      let body = '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (req.method === 'POST') {
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 16384) throw new Error('İstek çok büyük.');
          }
        }
        const parsed = body ? JSON.parse(body) : {};
        const cookie = readCookie(req, 'library');
        const authCookie = readCookie(req, 'library_auth');

        let result;
        if (action === 'auth/google') {
          if (!verifyToken) throw new Error('Google girişi yapılandırılmamış.');
          const idToken = parsed?.idToken;
          if (typeof idToken !== 'string' || !idToken || idToken.length > 8192) {
            throw new Error('Geçersiz Google oturum jetonu.');
          }
          const googleUser = await verifyToken(idToken);
          result = dispatch(cookie, action, {}, { authToken: authCookie, googleUser });
        } else {
          result = dispatch(cookie, action, parsed, { authToken: authCookie });
        }

        const setCookies = [];
        if (result.clearCookies) {
          setCookies.push(`library=; ${cookieAttributes(req, 0)}`);
          setCookies.push(`library_auth=; ${cookieAttributes(req, 0)}`);
        } else {
          if (result.id && result.id !== cookie) {
            setCookies.push(`library=${result.id}; ${cookieAttributes(req)}`);
          }
          if (result.authToken && result.authToken !== authCookie) {
            setCookies.push(`library_auth=${result.authToken}; ${cookieAttributes(req)}`);
          }
        }
        if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
        res.end(JSON.stringify(result.data));
      } catch (error) {
        res.writeHead(400).end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    const file = Object.hasOwn(publicFiles, path) && publicFiles[path];
    if (req.method === 'GET' && file) {
      try {
        const content = readFileSync(new URL(`./public/${file[0]}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': file[1] }).end(content);
        return;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    res.writeHead(404).end();
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const database = process.env.LIBRARY_DB || '.data/library.sqlite';
  mkdirSync(dirname(database), { recursive: true });
  const port = Number(process.env.PORT || 3000);
  createLibrary({ database }).listen(port, '0.0.0.0', () => console.log(`Sanal Kütüphane :${port}`));
}
