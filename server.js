import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error(`Sanal Kütüphane için Node.js 24 veya üzeri gerekir. Yüklü sürüm: ${process.version}.`);
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

export function createLibrary({ database = ':memory:', clock = Date.now } = {}) {
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL,
      room TEXT, status TEXT DEFAULT 'desk', seen INTEGER NOT NULL,
      coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0)
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
    const columns = new Set(all('PRAGMA table_info(sessions)').map(column => column.name));
    for (const column of ['paused_at', 'verification_due']) {
      if (!columns.has(column)) db.exec(`ALTER TABLE sessions ADD COLUMN ${column} INTEGER`);
    }
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
  const state = (id, now) => {
    const profile = get('SELECT name, avatar, room, status, coins FROM profiles WHERE id = ?', id);
    if (profile) profile.avatar = readAvatar(profile.avatar);
    const session = id && get('SELECT start, end, checks, state, paused_at, verification_due FROM sessions WHERE user = ? ORDER BY rowid DESC LIMIT 1', id);
    const counts = all('SELECT room, count(*) AS total FROM profiles WHERE seen > ? GROUP BY room', now - activeMs);
    const members = profile?.room ? all('SELECT id, name, avatar, status FROM profiles WHERE room = ? AND seen > ? ORDER BY rowid', profile.room, now - activeMs) : [];
    return {
      now, profile, session, items, inventory: id ? inventory(id) : [],
      rooms: rooms.map(room => ({ ...room, count: counts.find(row => row.room === room.id)?.total ?? 0 })),
      members: members.map(member => ({
        ...member, own: member.id === id, id: undefined, avatar: readAvatar(member.avatar),
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

  function dispatch(id, action, input) {
    return transaction(() => {
      const now = clock();
      let profile = id && get('SELECT * FROM profiles WHERE id = ?', id);
      if (!profile) id = null;
      if (id) settle(id, now);
      const current = id && active(id);
      if (current?.paused_at === null) {
        require(['state', 'status', 'verify'].includes(action), 'Diğer işlemler için önce mola ver.');
      }
      if (action === 'profile') {
        const [name, avatar] = saveAvatar(input, profile?.avatar);
        if (id) run('UPDATE profiles SET name = ?, avatar = ? WHERE id = ?', name, avatar, id);
        else {
          id = randomUUID();
          run('INSERT INTO profiles (id, name, avatar, seen, coins) VALUES (?, ?, ?, ?, ?)', id, name, avatar, now, startingCoins);
          run('INSERT INTO coin_ledger VALUES (?, ?, ?)', 'welcome:' + id, id, startingCoins);
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
      return { id, data: state(id, now) };
    });
  }

  const actions = new Set(['state', 'profile', 'join', 'leave', 'status', 'start', 'verify', 'buy', 'place']);
  const publicFiles = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/sprites.js': ['sprites.js', 'text/javascript; charset=utf-8'],
    '/library.webp': ['library.webp', 'image/webp'],
  };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const action = path.startsWith('/api/') ? path.slice(5) : '';
    if (actions.has(action) && req.method === (action === 'state' ? 'GET' : 'POST')) {
      if (req.method === 'POST' && req.headers['content-type'] !== 'application/json') {
        res.writeHead(415).end();
        return;
      }
      let body = '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (req.method === 'POST') {
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 4096) throw new Error('İstek çok büyük.');
          }
        }
        const cookie = req.headers.cookie?.match(/(?:^|;\s*)library=([a-f0-9-]{36})(?:;|$)/)?.[1];
        const { id, data } = dispatch(cookie, action, body ? JSON.parse(body) : {});
        if (id && id !== cookie) res.setHeader('Set-Cookie', `library=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`);
        res.end(JSON.stringify(data));
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
