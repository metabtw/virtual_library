import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { avatarSize, drawAvatar, drawProp, drawWritingHands, dressedAvatar, writingSize } from '../public/avatar-art.js';

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
  render(file, avatarSize.width, avatarSize.height, 5, rect =>
    drawAvatar(look, (color, blocks) => { for (const block of blocks) rect(color, ...block); }));
}

function prop(file, ...parts) {
  render(file, 16, 16, 10, rect => {
    for (const part of parts) drawProp(part, (color, x, y) => rect(color, x, y, 1, 1));
  });
}

for (const dir of ['avatars/', 'items/', 'animations/']) mkdirSync(new URL(dir, root), { recursive: true });
avatar('avatars/reader.png', base);
avatar('avatars/long-waves.png', { ...base, gender: 'female', color: '#bd7050' });
avatar('avatars/side-part.png', { ...base, gender: 'male', color: '#789078' });

for (const item of ['sweater', 'auroraHood', 'archiveVest', 'moonCoat', 'copperCurls', 'silverBraid', 'midnightFade']) {
  avatar('items/' + item + '.png', dressedAvatar(base, [item]));
}
for (const item of ['lamp', 'goldKeys', 'dragon', 'neon', 'teaSet', 'hourglass', 'miniGlobe', 'crystalTerrarium']) {
  prop('items/' + item + '.png', item);
}
prop('items/cat.png', 'catSleep');
prop('items/plant.png', 'leaves', 'pot');
render('items/space.png', 16, 16, 10, rect => {
  rect('#635586', 3, 5, 10, 7);
  rect('#a79bd9', 4, 4, 8, 8);
  rect('#ded8fa', 5, 5, 3, 2);
  rect('#e9bb74', 2, 8, 12, 2);
  rect('#f8e3b0', 13, 2, 2, 2);
});
render('items/forest.png', 16, 16, 10, rect => {
  rect('#638564', 1, 6, 5, 5);
  rect('#a2c389', 2, 3, 3, 5);
  rect('#705261', 5, 7, 9, 2);
  rect('#aa7554', 6, 9, 7, 5);
  rect('#f9c77a', 8, 9, 3, 3);
  rect('#477264', 2, 13, 12, 2);
});

for (const part of ['cat', 'catUpset', 'leaves', 'pot']) prop('animations/' + part + '.png', part);
for (let frame = 0; frame < writingSize.frames; frame++) {
  render('animations/writing-' + frame + '.png', writingSize.width, writingSize.height, 4, rect =>
    drawWritingHands(frame, (color, blocks) => { for (const block of blocks) rect(color, ...block); }));
}
