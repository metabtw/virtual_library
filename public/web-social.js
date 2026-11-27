import { portrait } from './sprites.js';
import { webText } from './web-strings.js';

export const reactionArt = { coffee: '☕', clap: '👏' };

export function messageFor(code, translate) {
  const message = translate(code);
  return message === code ? translate('server') : message;
}

export async function createStudyCardPreview(summary, profile, locale, options = {}) {
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
  const { partner, mode, name = true, minutes = true, streak = true, topics = false } = options;
  const week = mode === 'weekly' ? summary?.week : null;
  const [scene, avatar, logo, friendAvatar] = await Promise.all([
    load('/library.webp'), load(portrait(profile.avatar)), load('/app-logo.png'),
    partner?.partnerAvatar ? load(portrait(partner.partnerAvatar)) : null,
  ]);
  const width = 1280 * scene.naturalWidth / scene.naturalHeight;
  ctx.drawImage(scene, (720 - width) / 2, 0, width, 1280);
  ctx.fillStyle = '#201524c7';
  ctx.fillRect(0, 0, 720, 1280);
  ctx.fillStyle = '#38273b';
  ctx.fillRect(68, 166, 584, 948);
  ctx.strokeStyle = '#a9745e';
  ctx.lineWidth = 2;
  ctx.strokeRect(68, 166, 584, 948);
  ctx.drawImage(logo, 301, 184, 118, 118);
  ctx.imageSmoothingEnabled = false;
  if (friendAvatar) ctx.drawImage(friendAvatar, 418, 356, 106, 106 * friendAvatar.naturalHeight / friendAvatar.naturalWidth);
  ctx.drawImage(avatar, friendAvatar ? 196 : 305, 356, 110, 110 * avatar.naturalHeight / avatar.naturalWidth);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffeece';
  ctx.font = '700 34px system-ui';
  ctx.fillText(t('app'), 360, 338, 500);
  ctx.font = '700 38px system-ui';
  if (partner) ctx.fillText(profile.name + ' & ' + partner.friend, 360, 598, 520);
  else if (name) ctx.fillText(profile.name, 360, 598, 500);
  if (partner || minutes) {
    ctx.font = 'bold 94px system-ui';
    ctx.fillStyle = '#ffc275';
    ctx.fillText(partner ? partner.progress + ' / ' + partner.target : String(week?.minutes ?? summary.minutes), 360, 722, 510);
  }
  ctx.font = '32px system-ui';
  ctx.fillStyle = '#ffeece';
  ctx.fillText(t(partner ? 'pairComplete' : week ? 'cardWeeklyName' : 'studyToday'), 360, 780, 510);
  if (week && topics) {
    ctx.font = '25px system-ui';
    week.topics.forEach((topic, index) => ctx.fillText(topic, 360, 835 + index * 40, 480));
  } else if (!partner && !week && streak) {
    ctx.fillText(summary.streak + ' ' + t('studyStreak'), 360, 968);
  }
  ctx.fillStyle = '#dfbca7';
  ctx.font = '28px system-ui';
  ctx.fillText(partner?.week ?? (week ? week.starts + ' – ' + week.ends : summary.date), 360, 1052, 500);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('cardUnavailable');
  return { blob, filename: 'virtual-study-crew-' + (partner ? 'together-' + partner.week : week ? 'week-' + week.starts : summary.date) + '.png' };
}
