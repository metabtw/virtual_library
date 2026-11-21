import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawWritingHands, writingSize } from '../public/avatar-art.js';

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
