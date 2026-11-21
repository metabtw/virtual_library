import { avatarSize, drawAvatar, drawProp, drawWritingHands, standingAvatarSize, writingSize } from './avatar-art.js';
import { propSize } from './prop-art.js';

const portraits = new Map();

export function portrait(avatar, pose = 'standing') {
  const { gender, hair, outfit, color, hairSkin, outfitSkin, hair_style, outfit_style, skin_tone, hair_color, beard } = avatar;
  const key = [pose, gender, hair, outfit, color, hairSkin, outfitSkin, hair_style, outfit_style, skin_tone, hair_color, beard].join('/');
  if (portraits.has(key)) return portraits.get(key);

  const canvas = document.createElement('canvas');
  const size = pose === 'standing' ? standingAvatarSize : avatarSize;
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  drawAvatar(avatar, (shade, blocks) => {
    context.fillStyle = shade;
    for (const block of blocks) context.fillRect(...block);
  }, pose);

  const image = canvas.toDataURL();
  portraits.set(key, image);
  return image;
}

const props = new Map();

export function propImage(name) {
  if (props.has(name)) return props.get(name);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = propSize;
  const context = canvas.getContext('2d');
  drawProp(name, (shade, x, y) => {
    context.fillStyle = shade;
    context.fillRect(x, y, 1, 1);
  });
  const image = canvas.toDataURL();
  props.set(name, image);
  return image;
}

const writingStrips = new Map();

export function writingFrames(skinTone = 0) {
  if (writingStrips.has(skinTone)) return writingStrips.get(skinTone);
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
    }, skinTone);
  }
  const writingStrip = canvas.toDataURL();
  writingStrips.set(skinTone, writingStrip);
  return writingStrip;
}
