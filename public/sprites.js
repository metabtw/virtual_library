import { avatarSize, drawAvatar, drawProp, drawWritingHands, writingSize } from './avatar-art.js';

const portraits = new Map();

export function portrait({ gender = 'unspecified', hair, outfit, color, hairSkin, outfitSkin }) {
  const key = [gender, hair, outfit, color, hairSkin, outfitSkin].join('/');
  if (portraits.has(key)) return portraits.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = avatarSize.width;
  canvas.height = avatarSize.height;
  const context = canvas.getContext('2d');
  drawAvatar({ gender, hair, outfit, color, hairSkin, outfitSkin }, (shade, blocks) => {
    context.fillStyle = shade;
    for (const block of blocks) context.fillRect(...block);
  });

  const image = canvas.toDataURL();
  portraits.set(key, image);
  return image;
}

const props = new Map();

export function propImage(name) {
  if (props.has(name)) return props.get(name);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d');
  drawProp(name, (shade, x, y) => {
    context.fillStyle = shade;
    context.fillRect(x, y, 1, 1);
  });
  const image = canvas.toDataURL();
  props.set(name, image);
  return image;
}

let writingStrip;

export function writingFrames() {
  if (writingStrip) return writingStrip;
  const canvas = document.createElement('canvas');
  canvas.width = writingSize.width * writingSize.frames;
  canvas.height = writingSize.height;
  const context = canvas.getContext('2d');
  for (let frame = 0; frame < writingSize.frames; frame++) {
    drawWritingHands(frame, (shade, blocks) => {
      context.fillStyle = shade;
      for (const [x, y, width, height] of blocks) {
        context.fillRect(frame * writingSize.width + x, y, width, height);
      }
    });
  }
  writingStrip = canvas.toDataURL();
  return writingStrip;
}
