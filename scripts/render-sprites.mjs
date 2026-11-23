import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { avatarOptions, avatarPresets, drawAvatar, drawProp, drawWritingHands, dressedAvatar,
  standingAvatarSize, writingSize } from '../public/avatar-art.js';
import { propSize } from '../public/prop-art.js';

const base = { gender: 'unspecified', hair: 0, outfit: 1, color: '#83778f' };
const root = new URL('../mobile/assets/', import.meta.url);
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(payload));
  return Buffer.concat([size, payload, sum]);
}

function render(file, width, height, scale, paint) {
  const pixels = Buffer.alloc(width * height * 4);
  function rect(color, left, top, w, h) {
    const bytes = Buffer.from(color.slice(1), 'hex');
    const opacity = (bytes[3] ?? 255) / 255;
    for (let y = Math.max(0, top); y < Math.min(height, top + h); y++) {
      for (let x = Math.max(0, left); x < Math.min(width, left + w); x++) {
        const offset = (y * width + x) * 4;
        const previous = pixels[offset + 3] / 255 * (1 - opacity);
        const combined = opacity + previous;
        for (let i = 0; i < 3; i++) {
          pixels[offset + i] = Math.round((bytes[i] * opacity + pixels[offset + i] * previous) / (combined || 1));
        }
        pixels[offset + 3] = Math.round(combined * 255);
      }
    }
  }
  paint(rect);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width * scale, 0);
  header.writeUInt32BE(height * scale, 4);
  header[8] = 8;
  header[9] = 6;
  const rowLength = 1 + width * scale * 4;
  const raster = Buffer.alloc(rowLength * height * scale);
  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < width * scale; x++) {
      const src = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      pixels.copy(raster, 1 + y * rowLength + x * 4, src, src + 4);
    }
  }
  writeFileSync(new URL(file, root), Buffer.concat([
    signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raster)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

function avatar(file, look) {
  render(file, standingAvatarSize.width, standingAvatarSize.height, 5, rect =>
    drawAvatar(look, (color, blocks) => { for (const block of blocks) rect(color, ...block); }, 'standing'));
}

function prop(file, ...parts) {
  render(file, propSize, propSize, 5, rect => {
    for (const part of parts) drawProp(part, (color, x, y) => rect(color, x, y, 1, 1));
  });
}

for (const dir of ['avatars/', 'items/', 'animations/']) mkdirSync(new URL(dir, root), { recursive: true });
avatar('avatars/reader.png', base);
avatar('avatars/long-waves.png', { ...base, gender: 'female', color: '#bd7050' });
avatar('avatars/side-part.png', { ...base, gender: 'male', color: '#789078' });
for (const preset of avatarPresets) avatar('avatars/' + preset.id + '.png', preset.look);

for (const item of [
  'sweater', 'auroraHood', 'archiveVest', 'moonCoat', 'autumnPoncho', 'starlightJacket', 'mossOveralls',
  'copperCurls', 'silverBraid', 'midnightFade', 'lavenderBuns', 'mintBob',
  'twinBraids', 'shortWaves', 'sideSwept', 'highPonytail', 'curlyFringe',
  'denimJacket', 'stripedCardigan', 'linenShirt', 'raincoat', 'boatNeckSweater',
]) {
  avatar('items/' + item + '.png', dressedAvatar(base, [item]));
}
for (const item of [
  'lamp', 'goldKeys', 'dragon', 'neon', 'teaSet', 'hourglass', 'miniGlobe', 'crystalTerrarium',
  'mushroomLamp', 'foxMug', 'retroRadio', 'jellyTank', 'origamiCrane', 'pinkRabbit', 'pugPup', 'yellowChick',
  'cat', 'space', 'forest', 'mysteryBox', 'epicBox', 'legendaryBox',
  'brassLamp', 'deskCalendar', 'pottedCactus', 'recordPlayer', 'zenGarden',
  'moonstoneLamp', 'rainbowPrism', 'moonGlobe', 'arcticFox', 'clockworkOwl',
]) {
  prop('items/' + item + '.png', item);
}
prop('items/plant.png', 'leaves', 'pot');

for (const part of ['catSleep', 'catUpset', 'leaves', 'pot', 'jellyTankBase', 'jellyTankDrift']) prop('animations/' + part + '.png', part);
for (let tone = 0; tone < avatarOptions.skin_tone.tr.length; tone++) {
  for (let frame = 0; frame < writingSize.frames; frame++) {
    const file = tone === 0 ? 'writing-' + frame : 'writing-' + tone + '-' + frame;
    render('animations/' + file + '.png', writingSize.width, writingSize.height, 4, rect =>
      drawWritingHands(frame, (color, blocks) => { for (const block of blocks) rect(color, ...block); }, tone));
  }
}
