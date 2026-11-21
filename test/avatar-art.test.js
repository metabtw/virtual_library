import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avatarSize, drawAvatar, drawProp, drawWritingHands, dressedAvatar, hasPropArt, writingSize } from '../public/avatar-art.js';

test('the shared writing loop has four bounded poses with a moving pencil and notebook', () => {
  const { width, height, frames } = writingSize;
  assert.equal(frames, 4);
  const rendered = [];
  const pencil = [];
  for (let frame = 0; frame < frames; frame++) {
    const strokes = [];
    drawWritingHands(frame, (shade, blocks) => {
      assert.match(shade, /^#[0-9a-f]{6}$/);
      for (const [x, y, w, h] of blocks) {
        assert.ok([x, y, w, h].every(Number.isInteger));
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0);
        assert.ok(x + w <= width && y + h <= height);
      }
      strokes.push([shade, blocks]);
    });
    assert.ok(strokes.some(([shade]) => shade === '#fff0c4'), 'paper is visible in each frame');
    pencil.push(strokes.find(([shade]) => shade === '#ffca74')?.[1][0]);
    rendered.push(JSON.stringify(strokes));
  }
  assert.ok(pencil.every(Boolean));
  assert.equal(new Set(pencil.map(point => point.join(','))).size, frames);
  assert.equal(new Set(rendered).size, frames);
});

test('new shop items have distinct skins and complete pixel art', () => {
  const base = { gender: 'female', hair: 0, outfit: 1, color: '#789078' };
  const avatarArt = look => {
    const strokes = [];
    drawAvatar(look, (color, blocks) => {
      for (const [x, y, width, height] of blocks) {
        assert.ok(x >= 0 && y >= 0 && x + width <= avatarSize.width && y + height <= avatarSize.height);
      }
      strokes.push([color, blocks]);
    });
    return JSON.stringify(strokes);
  };
  const skins = ['autumnPoncho', 'starlightJacket', 'mossOveralls', 'lavenderBuns', 'mintBob'];
  assert.equal(new Set([avatarArt(base), ...skins.map(item => avatarArt(dressedAvatar(base, [item])))]).size,
    skins.length + 1);

  for (const item of ['mushroomLamp', 'foxMug', 'retroRadio', 'jellyTank', 'origamiCrane']) {
    assert.ok(hasPropArt(item));
    const pixels = [];
    drawProp(item, (color, x, y) => {
      assert.match(color, /^#[0-9a-f]{6}$/);
      assert.ok(x >= 0 && x < 16 && y >= 0 && y < 16);
      pixels.push(color);
    });
    assert.ok(pixels.length > 40, `${item} has a visible silhouette`);
  }
});
