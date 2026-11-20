import { avatarSize, drawAvatar, drawProp } from './avatar-art.js';

const portraits = new Map();

export function portrait({ gender = 'unspecified', hair, outfit, color }) {
  const key = [gender, hair, outfit, color].join('/');
  if (portraits.has(key)) return portraits.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = avatarSize.width;
  canvas.height = avatarSize.height;
  const context = canvas.getContext('2d');
  drawAvatar({ gender, hair, outfit, color }, (shade, blocks) => {
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
