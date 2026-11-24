import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameRound } from '../public/game-scenes.js';
import { dropBook, newTower, slideMerge, tickGlide } from '../public/study-games.js';
import { roomProgressMinutes } from '../public/study-rewards.js';

test('books keep only their aligned overlap and a complete miss ends the round', () => {
  const aligned = dropBook({ ...newTower(), x: 29.5 });
  assert.deepEqual(aligned.books.at(-1), { x: 29, width: 42 });
  const partial = dropBook({ ...aligned, x: 49 });
  assert.deepEqual(partial.books.at(-1), { x: 49, width: 22 });
  assert.equal(dropBook({ ...partial, x: 0 }).done, true);
});

test('library items merge once per swipe and a blocked move spawns nothing', () => {
  const board = [1, 1, 2, 2, ...new Array(12).fill(0)];
  const move = slideMerge({ board, score: 0, done: false }, 'left', () => 0.99);
  assert.deepEqual(move.board.slice(0, 4), [2, 3, 0, 0]);
  assert.equal(move.score, 12);
  assert.deepEqual(move.motion.travel, [
    { from: 0, to: 0, level: 1 }, { from: 1, to: 0, level: 1 },
    { from: 2, to: 1, level: 2 }, { from: 3, to: 1, level: 2 },
  ]);
  assert.deepEqual(move.motion.combinations, [0, 1]);
  assert.equal(move.motion.spawned, 15);
  const blocked = { board: [1, ...new Array(15).fill(0)], score: 0, done: false };
  assert.equal(slideMerge(blocked, 'left', () => { throw Error('Cannot spawn on a blocked move'); }), blocked);
});

test('paper plane counts a shelf once, slows down, and stops on its fifth bump', () => {
  const state = {
    active: true, y: 90, velocity: 0, hits: 3, score: 1,
    gates: [{ x: 22, gap: 40, hit: false, collected: false }, { x: 60, gap: 40, hit: false, collected: false }],
  };
  const bump = tickGlide(state, false, 0.04);
  const after = tickGlide(bump, false, 0.04);
  assert.equal(bump.hits, 4);
  assert.equal(after.hits, 4);
  assert.ok(bump.gates[0].x - after.gates[0].x < state.gates[0].x - bump.gates[0].x);
  const last = tickGlide({ ...after, gates: [{ x: 22, gap: 40, hit: false, collected: false }] }, false, 0.04);
  assert.equal(last.hits, 5);
  assert.equal(tickGlide(last, true, 0.04), last);
});

test('a dropped book falls toward the stack before scoring and landing effects', () => {
  const round = createGameRound('tower');
  round.step(29 / 26.2);
  assert.equal(round.frame().guide.aligned, true);
  round.input('drop');
  const start = round.frame();
  assert.equal(start.score, 0);
  assert.equal(start.disabled, true);
  round.step(.08);
  assert.ok(round.frame().nodes.find(node => node.key === 'falling').y > start.nodes.find(node => node.key === 'falling').y);
  round.step(.11);
  const landed = round.frame();
  assert.equal(landed.score, 1);
  assert.equal(landed.notice, true);
  assert.ok(landed.nodes.some(node => node.key.startsWith('land')));
  assert.ok(round.frame(true).nodes.every(node => !node.key.startsWith('land')));
});

test('a held paper plane rises with a trail and resumes its descent on release', () => {
  const round = createGameRound('glide');
  const planeY = () => round.frame(true).nodes.find(node => node.key === 'paper-plane').y;
  const before = planeY();
  round.input('hold');
  for (let n = 0; n < 8; n++) round.step(.04);
  const lifted = planeY();
  assert.ok(lifted < before);
  assert.ok(round.frame().nodes.some(node => node.key.startsWith('trail')));
  assert.ok(round.frame(true).nodes.every(node => !node.key.startsWith('trail')));
  round.input('release');
  for (let n = 0; n < 26; n++) round.step(.04);
  assert.ok(planeY() > lifted);
});

test('room goal includes running time up to its server cap and drops invalidated time', () => {
  const saved = { settled: 130, live: [{ start: 10_000, until: 187_000 }] };
  assert.equal(roomProgressMinutes(saved, 125_000), 131);
  assert.equal(roomProgressMinutes(saved, 300_000), 132);
  assert.equal(roomProgressMinutes({ ...saved, live: [] }, 300_000), 130);
  assert.equal(roomProgressMinutes({ ...saved, settled: 179 }, 300_000), 180);
});
