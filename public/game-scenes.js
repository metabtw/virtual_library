import { dropBook, glideSpeed, newGlide, newMerge, newTower, slideMerge, tickGlide, tickTower } from './study-games.js';

export const gameArt = {
  tower: { room: 'old-archive', icon: 5, accent: '#ffc993', edge: '#a87459' },
  merge: { room: 'literature', icon: 10, accent: '#f5bcbb', edge: '#9b637c' },
  glide: { room: 'aurora-observatory', icon: 16, accent: '#b5e6db', edge: '#6b9b97' },
};
export const atlasColumns = 6;
export const atlasRows = 4;
const [deskLamp, paper, plane, shelf, desk, star, dust] = [5, 6, 16, 17, 18, 19, 20];
const cup = 10;
const tileColors = ['#4d3642', '#5f354c', '#294645', '#484062', '#614039', '#345066', '#534467', '#644831', '#534162', '#5d4351'];
const lerp = (a, b, amount) => a + (b - a) * amount;
const clamp = value => Math.min(1, Math.max(0, value));
const out = value => 1 - (1 - clamp(value)) ** 3;
const itemLevel = level => Math.min(10, level);
const tileX = slot => 6 + (slot % 4) * 22.5;
const tileY = slot => 6 + Math.floor(slot / 4) * 22.5;
const placed = (key, art, x, y, width, height, extra) => ({ key, art, x, y, width, height, ...extra });
const tile = (key, level, x, y, progress = 1, glow = 0) =>
  placed(key, paper + itemLevel(level) - 1, x, y, 20.5, 20.5, { level, color: tileColors[itemLevel(level) - 1], scale: progress, glow });

function sparkles(outcome, age, prefix) {
  if (!outcome || age >= .48) return [];
  const amount = out(age / .48);
  return [[-5, -5, .9], [-3, 2, .58], [1.5, -9, .74], [5, -4, .66], [7, 0, .47]].map(([dx, dy, size], index) =>
    placed(prefix + index, outcome.art ?? star, outcome.x + dx * amount, outcome.y + dy * amount,
      6 * size * (1 + amount * .45), 8 * size * (1 + amount * .45), { opacity: 1 - amount }));
}

function motes(time, offset) {
  return [[11, 26], [22, 63], [41, 18], [56, 36], [69, 14], [83, 47], [92, 29]].map(([x, y], i) =>
    placed('mote' + i, star, (x + 100 - offset % 100) % 100, y + Math.sin(time * .65 + i) * 4,
      1.1 + i % 3 * .5, 1.6 + i % 3 * .65, { opacity: .22 + .18 * Math.sin(time * 1.5 + i) }));
}

function towerRound() {
  let game = newTower();
  let fall, landing;
  let time = 0, camera = 0;
  const spacing = 9.1;
  const bottom = 78.8;
  const height = 10;
  const book = (key, number, x, y, width, extra) =>
    placed(key, number % 5, x, y, width, height, extra);
  const levelY = level => bottom - level * spacing + camera;
  const canDrop = () => !game.done && !fall;

  function input(command) {
    if (command !== 'drop' || !canDrop()) return;
    const result = dropBook(game);
    fall = {
      next: result,
      start: time,
      length: result.done ? .32 : .18,
      y: Math.max(6, levelY(game.books.length) - 22),
      aligned: Math.abs(game.x - game.books.at(-1).x) < 1.7,
      index: game.books.length,
    };
    landing = undefined;
  }

  function step(seconds) {
    if (game.done) return false;
    time += seconds;
    camera = lerp(camera, Math.max(0, game.books.length - 5) * spacing, 1 - Math.exp(-10 * seconds));
    if (fall && time - fall.start >= fall.length) {
      const last = fall.next.books.at(-1);
      landing = {
        x: last.x + last.width / 2,
        y: levelY(fall.index) + 4,
        index: fall.index,
        time,
        aligned: fall.aligned,
        art: fall.aligned ? star : dust,
        shavings: fall.next.done || fall.aligned ? [] : [
          { x: game.x, width: last.x - game.x, direction: -1 },
          { x: last.x + last.width, width: game.x + game.width - last.x - last.width, direction: 1 },
        ].filter(part => part.width > .8),
      };
      game = fall.next;
      fall = undefined;
    } else if (canDrop()) game = tickTower(game, seconds);
    return true;
  }

  function frame(reduced) {
    const age = time - (landing?.time ?? -1);
    const first = Math.max(0, game.books.length - 6);
    const nodes = [
      ...(reduced ? [] : motes(time, 0)),
      placed('side-lamp', deskLamp, 11, 63, 9.5, 19),
      placed('side-cup', cup, 79, 72, 8, 11),
      placed('table', desk, 5, 78, 90, 35),
      ...game.books.slice(first).map(({ x, width }, offset) => {
        const level = first + offset;
        const settle = !reduced && landing?.index === level && age < .22
          ? 1 + Math.sin(age / .22 * Math.PI * 2) * .075 * (1 - age / .22) : 1;
        return book('book' + level, level, x, levelY(level), width, { scale: settle });
      }),
    ];
    const next = game.books.length;
    const y = Math.max(6, levelY(next) - 22);
    if (fall) {
      const progress = clamp((time - fall.start) / fall.length);
      nodes.push(book('falling', next, game.x, lerp(fall.y, fall.next.done ? 100 : levelY(next), progress ** 2), game.width,
        { rotate: fall.next.done && !reduced ? -18 * progress : 0, opacity: fall.next.done ? 1 - progress * .8 : 1 }));
    } else if (!game.done) {
      nodes.push(book('moving', next, game.x, y + (reduced ? 0 : Math.sin(time * 4) * .65), game.width));
    }
    if (landing && !game.done && !reduced) {
      nodes.push(...sparkles(landing, age, 'land'));
      if (age < .4) {
        for (const part of landing.shavings) {
          nodes.push(book('trim' + part.direction, landing.index, part.x + age * 13 * part.direction,
            landing.y + (age * 23) ** 2 / 4, part.width, { opacity: 1 - age / .4, rotate: age * 95 * part.direction }));
        }
      }
    }
    const top = game.books.at(-1);
    return { nodes, score: next - 1, done: game.done, disabled: !canDrop(), notice: landing?.aligned && age < .8,
      guide: canDrop() ? { x: top.x, y: levelY(next), width: top.width, height, aligned: Math.abs(top.x - game.x) < 1.7 } : undefined };
  }

  return { input, step, frame };
}

function mergeRound() {
  let game = newMerge();
  let age = 1, queued, previousScore = 0;
  const sliding = .135;
  const settling = .27;

  function input(direction) {
    if (!['up', 'down', 'left', 'right'].includes(direction) || game.done) return;
    if (age < settling) {
      queued = direction;
      return;
    }
    const next = slideMerge(game, direction);
    if (next === game) return;
    previousScore = game.score;
    game = next;
    age = 0;
  }

  function step(seconds) {
    if (age >= settling) return false;
    age += seconds;
    if (age >= settling && queued) {
      const next = queued;
      queued = undefined;
      input(next);
    }
    return true;
  }

  function frame(reduced) {
    const motion = game.motion;
    const isSliding = motion && age < sliding && !reduced;
    const nodes = [];
    if (isSliding) {
      const progress = out(age / sliding);
      for (const { from, to, level } of motion.travel) {
        nodes.push(tile('tile' + from, level, lerp(tileX(from), tileX(to), progress), lerp(tileY(from), tileY(to), progress)));
      }
    } else {
      const impact = (age - sliding) / (settling - sliding);
      for (const [slot, level] of game.board.entries()) {
        if (!level) continue;
        const merged = motion?.combinations.includes(slot);
        const scale = reduced || !motion || impact >= 1 ? 1 : merged ? 1 + Math.sin(impact * Math.PI) * .15
          : motion.spawned === slot ? lerp(.62, 1, out(impact)) : 1;
        nodes.push(tile('tile' + slot, level, tileX(slot), tileY(slot), scale, merged && !reduced ? 1 - clamp(impact) : 0));
        if (merged && !reduced) {
          nodes.push(...sparkles({ x: tileX(slot) + 8, y: tileY(slot) + 8 }, Math.max(0, age - sliding) * 2.6, 'merge' + slot + '-'));
        }
      }
    }
    return { nodes, score: isSliding ? previousScore : game.score, done: game.done && age >= settling };
  }

  return { input, step, frame };
}

function glideRound() {
  let game = newGlide();
  let time = 0, travel = 0, nextTrail = 0;
  let held = false;
  let impact, light;
  let trail = [];

  function input(command) {
    if (command === 'release') held = false;
    if (command === 'hold' && game.hits < 5) {
      held = true;
      if (!game.active) game = { ...game, active: true };
    }
  }

  function step(seconds) {
    if (game.hits === 5 && time - impact.time >= .35) return false;
    time += seconds;
    if (!game.active || game.hits === 5) return true;
    travel += glideSpeed(game.hits) * seconds;
    const next = tickGlide(game, held, seconds);
    if (next.hits > game.hits) impact = { time, x: 19, y: next.y, art: dust };
    if (next.score > game.score) {
      const orb = next.gates.find((gate, index) => gate.collected && !game.gates[index].collected);
      light = { time, x: orb?.x ?? 21, y: orb?.gap ?? next.y };
    }
    if (time >= nextTrail) {
      trail = [{ time, x: travel, y: next.y }, ...trail.filter(mark => time - mark.time < .48)].slice(0, 9);
      nextTrail = time + .052;
    }
    game = next;
    return true;
  }

  function frame(reduced) {
    const age = time - (impact?.time ?? -1);
    const jolting = !reduced && age < .33;
    const y = game.active || reduced ? game.y : game.y + Math.sin(time * 2.5) * 2.2;
    const nodes = reduced ? [] : motes(time, travel * .36);
    for (const [number, gate] of game.gates.entries()) {
      nodes.push(
        placed('top' + number, shelf, gate.x - 2, -2, 9, gate.gap - 15),
        placed('bottom' + number, shelf, gate.x - 2, gate.gap + 17, 9, 85 - gate.gap),
      );
      if (!gate.collected) {
        const pulse = reduced ? 1 : 1 + Math.sin(time * 4 + number) * .18;
        nodes.push(placed('orb' + number, star, gate.x - 1, gate.gap - 5, 7, 10, { scale: pulse }));
      }
    }
    if (!reduced) {
      for (const [index, mark] of trail.entries()) {
        const age = time - mark.time;
        if (age >= .48) continue;
        nodes.push(placed('trail' + index, star, 14 - (travel - mark.x) * 1.2 - age * 11, mark.y - 1.5,
          2.4, 3.1, { opacity: .68 * (1 - age / .48), scale: .65 + age * .7 }));
      }
      if (light) nodes.push(...sparkles(light, time - light.time, 'orb-pop'));
      if (impact) nodes.push(...sparkles(impact, age, 'shelf-puff'));
    }
    const recoil = jolting ? 4 * (1 - age / .33) : 0;
    nodes.push(placed('paper-plane', plane, 13.5 - recoil, y - 10, 13, 20, {
      rotate: (game.active ? game.velocity * .55 : -5) + (jolting ? Math.sin(age * 44) * 17 * (1 - age / .33) : 0),
    }));
    return { nodes, score: game.score, hits: game.hits, active: game.active, shift: reduced ? 0 : Math.sin(travel * .018) * 2.1,
      done: game.hits === 5 && age >= .35 };
  }

  return { input, step, frame };
}

const rounds = { tower: towerRound, merge: mergeRound, glide: glideRound };
export function createGameRound(id) {
  return rounds[id]();
}
