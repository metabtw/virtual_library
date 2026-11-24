export const gameIds = ['tower', 'merge', 'glide'];

const gameCopy = {
  tr: {
    titles: { tower: 'Kitap Kulesi', merge: 'Kahve & Notlar', glide: 'Kağıt Uçak' },
    help: {
      tower: 'Sallanan kitabı tam hizadayken bırak. Kenardan taşan kısım kesilir.',
      merge: 'Ok tuşları, kaydırma veya yön düğmeleriyle aynı eşyaları birleştir.',
      glide: 'Yükselmek için basılı tut, alçalmak için bırak. Işık kürelerini topla. Raflara 5 defa çarparsan uçuş biter.',
    },
    restart: 'Yeniden başla', drop: 'Kitabı bırak', lift: 'Yükselmek için bas', score: 'Puan', books: 'Kitap',
    hits: 'Temas', ended: 'Tur tamamlandı', start: 'Uçuşa başla', aligned: 'Tam hizalı!',
    controls: 'Oyun kontrolleri', chapters: { tower: 'Kitapları hizala', merge: 'Eşyaları birleştir', glide: 'Işıkları topla' },
    directions: { left: 'Sola', up: 'Yukarı', down: 'Aşağı', right: 'Sağa' },
    items: ['', 'Kağıt', 'Defter', 'Kitap', 'Ansiklopedi', 'Kahve', 'Mürekkep', 'Kristal', 'Yıldız', 'Ay', 'Kütüphane'],
  },
  en: {
    titles: { tower: 'Book Tower', merge: 'Coffee & Notes', glide: 'Paper Plane' },
    help: {
      tower: 'Drop the swaying book when it lines up with the stack. Any overhang is trimmed.',
      merge: 'Combine matching items using the arrow keys, a swipe, or the direction buttons.',
      glide: 'Hold to rise and release to glide down. Collect light orbs. Your flight ends after 5 bumps into the shelves.',
    },
    restart: 'Restart', drop: 'Drop book', lift: 'Hold to rise', score: 'Score', books: 'Books',
    hits: 'Bumps', ended: 'Round complete', start: 'Start flight', aligned: 'Perfect stack!',
    controls: 'Game controls', chapters: { tower: 'Line up the books', merge: 'Combine items', glide: 'Collect the lights' },
    directions: { left: 'Left', up: 'Up', down: 'Down', right: 'Right' },
    items: ['', 'Paper', 'Notebook', 'Book', 'Encyclopedia', 'Coffee', 'Ink', 'Crystal', 'Star', 'Moon', 'Library'],
  },
};

export const gameText = locale => gameCopy[locale === 'en' ? 'en' : 'tr'];

export function newTower() {
  return { books: [{ x: 29, width: 42 }], x: 0, width: 42, direction: 1, done: false };
}

export function tickTower(tower, seconds) {
  if (tower.done) return tower;
  const limit = 100 - tower.width;
  const speed = Math.min(49, 25 + tower.books.length * 1.2);
  const x = tower.x + tower.direction * speed * seconds;
  if (x > limit) return { ...tower, x: 2 * limit - x, direction: -1 };
  if (x < 0) return { ...tower, x: -x, direction: 1 };
  return { ...tower, x };
}

export function dropBook(tower) {
  if (tower.done) return tower;
  const target = tower.books.at(-1);
  const aligned = Math.abs(tower.x - target.x) < 1.7;
  const left = aligned ? target.x : Math.max(tower.x, target.x);
  const right = aligned ? target.x + target.width : Math.min(tower.x + tower.width, target.x + target.width);
  const width = right - left;
  if (width < 2.5) return { ...tower, done: true };
  return { books: [...tower.books, { x: left, width }], width,
    x: tower.direction > 0 ? 100 - width : 0, direction: -tower.direction, done: false };
}

function placeTile(board, random) {
  const empty = board.flatMap((tile, index) => tile ? [] : [index]);
  if (!empty.length) return null;
  const index = empty[Math.floor(random() * empty.length)];
  board[index] = random() < 0.9 ? 1 : 2;
  return index;
}

export function newMerge(random = Math.random) {
  const board = new Array(16).fill(0);
  placeTile(board, random);
  placeTile(board, random);
  return { board, score: 0, done: false };
}

export function slideMerge(game, direction, random = Math.random) {
  if (game.done) return game;
  const board = game.board.slice();
  const vertical = direction === 'up' || direction === 'down';
  const reversed = direction === 'right' || direction === 'down';
  let score = game.score;
  const travel = [];
  const combinations = [];
  for (let line = 0; line < 4; line++) {
    const slots = Array.from({ length: 4 }, (_, index) => vertical ? line + index * 4 : line * 4 + index);
    if (reversed) slots.reverse();
    const tiles = slots.filter(slot => board[slot]).map(slot => ({ slot, level: board[slot] }));
    const merged = [];
    for (let index = 0; index < tiles.length; index++) {
      const { slot, level } = tiles[index];
      const to = slots[merged.length];
      travel.push({ from: slot, to, level });
      if (level === tiles[index + 1]?.level) {
        travel.push({ from: tiles[++index].slot, to, level });
        combinations.push(to);
        merged.push(level + 1);
        score += 2 ** (level + 1);
      } else merged.push(level);
    }
    slots.forEach((slot, index) => { board[slot] = merged[index] ?? 0; });
  }
  if (board.every((value, index) => value === game.board[index])) return game;
  const spawned = placeTile(board, random);
  const done = board.every((value, index) => value && ((index % 4 === 3 || board[index + 1] !== value) && board[index + 4] !== value));
  return { board, score, done, motion: { travel, combinations, spawned } };
}

export function newGlide() {
  return { active: false, y: 50, velocity: 0, hits: 0, score: 0, gates: [
    { x: 63, gap: 54, hit: false, collected: false },
    { x: 101, gap: 35, hit: false, collected: false },
    { x: 139, gap: 68, hit: false, collected: false },
  ] };
}

export const glideSpeed = hits => 21 * (5 - hits) / 5;

export function tickGlide(game, held, seconds, random = Math.random) {
  if (!game.active || game.hits >= 5) return game;
  const velocity = Math.max(-46, Math.min(38, game.velocity + (held ? -108 : 69) * seconds));
  const y = Math.max(5, Math.min(95, game.y + velocity * seconds));
  const speed = glideSpeed(game.hits);
  let hits = game.hits;
  let score = game.score;
  let farthest = Math.max(...game.gates.map(gate => gate.x)) - speed * seconds;
  const gates = game.gates.map(gate => {
    const x = gate.x - speed * seconds;
    if (x < -9) {
      farthest += 38;
      return { x: farthest, gap: 30 + random() * 40, hit: false, collected: false };
    }
    const close = x <= 24 && x >= 14;
    const space = Math.abs(y - gate.gap);
    const collision = close && space > 15 && !gate.hit;
    const caught = Math.abs(x - 20) <= 5 && space <= 8 && !gate.collected;
    if (collision) hits++;
    if (caught) score++;
    return { ...gate, x, hit: gate.hit || collision, collected: gate.collected || caught };
  });
  return { ...game, y, velocity, hits, score, gates };
}
