import { portrait } from './sprites.js';
import { webText } from './web-strings.js';

export const reactionArt = { coffee: '☕', clap: '👏' };

export function messageFor(code, translate) {
  const message = translate(code);
  return message === code ? translate('server') : message;
}

export async function downloadStudyCard(summary, profile, locale) {
  const t = key => webText(locale, key);
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  const load = async src => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  };
  const [scene, avatar, logo] = await Promise.all([load('/library.webp'), load(portrait(profile.avatar)), load('/app-logo.png')]);
  const width = 1280 * scene.naturalWidth / scene.naturalHeight;
  ctx.drawImage(scene, (720 - width) / 2, 0, width, 1280);
  ctx.fillStyle = '#201524c7';
  ctx.fillRect(0, 0, 720, 1280);
  ctx.fillStyle = '#38273b';
  ctx.fillRect(68, 166, 584, 948);
  ctx.strokeStyle = '#a9745e';
  ctx.lineWidth = 2;
  ctx.strokeRect(68, 166, 584, 948);
  ctx.drawImage(logo, 336, 184, 48, 48);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(avatar, 296, 282, 128, 128 * avatar.naturalHeight / avatar.naturalWidth);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffeece';
  ctx.font = '700 34px system-ui';
  ctx.fillText(t('app'), 360, 266, 500);
  ctx.font = '700 42px system-ui';
  ctx.fillText(profile.name, 360, 573, 500);
  ctx.font = 'bold 100px system-ui';
  ctx.fillStyle = '#ffc275';
  ctx.fillText(String(summary.minutes), 360, 740);
  ctx.font = '32px system-ui';
  ctx.fillStyle = '#ffeece';
  ctx.fillText(t('studyToday'), 360, 799, 510);
  ctx.fillText(summary.streak + ' ' + t('studyStreak'), 360, 968);
  ctx.fillStyle = '#dfbca7';
  ctx.fillText(summary.date, 360, 1052);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('cardUnavailable');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'virtual-study-crew-' + summary.date + '.png';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
