import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avatarOptions, avatarPresets, avatarSize, defaultAvatar, deskEquipment, drawAvatar, drawProp, drawWritingHands,
  dressedAvatar, hairStyles, hasPropArt, petAppearance, pickAvatarStyle, standingAvatarSize, writingSize } from '../public/avatar-art.js';
import { propSize } from '../public/prop-art.js';

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

  for (const item of ['mushroomLamp', 'foxMug', 'retroRadio', 'jellyTank', 'origamiCrane', 'crystalTerrarium',
    'cat', 'pugPup', 'goldKeys', 'dragon', 'space', 'forest', 'jellyTankBase', 'jellyTankDrift']) {
    assert.ok(hasPropArt(item));
    const pixels = [];
    drawProp(item, (color, x, y) => {
      assert.match(color, /^#[0-9a-f]{6}$/);
      assert.ok(x >= 0 && x < propSize && y >= 0 && y < propSize);
      pixels.push(color);
    });
    assert.ok(pixels.length > 40, `${item} has a visible silhouette`);
  }
});

test('presets and extra avatar styles render standing pixels with compatible base indexes', () => {
  assert.equal(avatarPresets.length, 6);
  const presetDrawings = new Set();
  for (const { look } of avatarPresets) {
    assert.ok(look.hair <= 2 && look.outfit <= 2);
    const rendered = [];
    drawAvatar(look, (color, blocks) => rendered.push([color, blocks]), 'standing');
    assert.ok(rendered.some(([, blocks]) => blocks.some(([, y]) => y >= avatarSize.height)));
    presetDrawings.add(JSON.stringify(rendered));
  }
  assert.equal(presetDrawings.size, avatarPresets.length);
  for (const [gender, labels] of Object.entries(hairStyles)) {
    for (const [hair] of labels.tr.entries()) {
      const look = pickAvatarStyle({ ...defaultAvatar, gender }, 'hair', hair);
      const full = pickAvatarStyle(look, 'outfit', avatarOptions.outfit.tr.length - 1);
      assert.equal(full.hair_style ?? full.hair, hair);
      assert.equal(full.outfit_style, 5);
      drawAvatar(full, (_color, blocks) => {
        for (const [x, y, w, h] of blocks) {
          assert.ok(x >= 0 && y >= 0 && x + w <= standingAvatarSize.width && y + h <= standingAvatarSize.height);
        }
      }, 'standing');
    }
  }
  const hands = tone => {
    const pixels = [];
    drawWritingHands(0, (color, blocks) => pixels.push([color, blocks]), tone);
    return JSON.stringify(pixels);
  };
  assert.notEqual(hands(0), hands(4));
});

test('tabletop art reserves one cell per slot and pets a separate path', () => {
  assert.deepEqual(deskEquipment(['cat', 'dragon', 'goldKeys', 'teaSet', 'jellyTank', 'mushroomLamp', 'mintBob']), {
    props: ['mushroomLamp', 'teaSet', 'jellyTank'], pet: 'cat',
  });
  assert.deepEqual(deskEquipment(['pinkRabbit', 'lavenderBuns']), { props: [undefined, undefined, undefined], pet: 'pinkRabbit' });
  assert.equal(petAppearance('cat', { xp: 1, upset: false }).art, 'catSleep');
  assert.equal(petAppearance('dragon').rests, true);
  for (const item of ['pinkRabbit', 'pugPup', 'yellowChick']) {
    assert.equal(petAppearance(item).rests, false);
    drawProp(item, (color, x, y) => {
      assert.match(color, /^#[0-9a-f]{6}$/);
      assert.ok(x >= 0 && x < propSize && y >= 0 && y < propSize);
    });
  }
});
