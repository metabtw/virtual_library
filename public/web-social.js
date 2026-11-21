import { portrait } from './sprites.js';

export const reactionArt = { coffee: '☕', clap: '👏' };

export function messageFor(code) {
  return ({
    missingConfig: 'Supabase bağlantısı tanımlanmalı.',
    unauthorized: 'Oturum kapandı. Lütfen tekrar giriş yap.',
    working: 'Bu işlem için önce mola ver.',
    insufficientCoins: 'Yeterli jetonun yok.',
    itemOwned: 'Eşya zaten envanterinde.',
    itemMissing: 'Bu eşya doğrudan satın alınamıyor veya kullanılamıyor.',
    invalidDuration: '5–180 dakika arasında tam sayı gir.',
    verificationClosed: 'Doğrulama penceresi kapandı.',
    invalidAvatar: 'Geçerli bir kullanıcı adı ve avatar seç.',
    invalidTarget: 'Hedef tek satır ve en fazla 48 karakter olmalı.',
    roomFull: 'Bu oda dolu.',
    inviteRequired: 'Bu odaya davet koduyla katılabilirsin.',
    invalidInvite: 'Davet kodu geçersiz.',
    inviteLimited: 'Bir dakika sonra tekrar dene.',
    invalidRoomName: 'Oda adı 2–32 karakter olmalı.',
    reactionSlowDown: 'Yeni bir tepki göndermeden önce birkaç saniye bekle.',
    reactionUnavailable: 'Bu masa şu anda ulaşılabilir değil.',
    noChest: 'Açılacak sandık yok.',
    collectionComplete: 'Nadir eşya koleksiyonun tamamlandı.',
    accountDeletion: 'Hesap silinemedi. Tekrar dene.',
  })[code] ?? 'Sunucuya bağlanılamadı. Tekrar dene.';
}

export async function downloadStudyCard(summary, profile) {
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
  const [scene, avatar] = await Promise.all([load('/library.webp'), load(portrait(profile.avatar))]);
  const width = 1280 * scene.naturalWidth / scene.naturalHeight;
  ctx.drawImage(scene, (720 - width) / 2, 0, width, 1280);
  ctx.fillStyle = '#201524c7';
  ctx.fillRect(0, 0, 720, 1280);
  ctx.fillStyle = '#38273b';
  ctx.fillRect(68, 166, 584, 948);
  ctx.strokeStyle = '#a9745e';
  ctx.lineWidth = 2;
  ctx.strokeRect(68, 166, 584, 948);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(avatar, 296, 282, 128, 128 * avatar.naturalHeight / avatar.naturalWidth);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffeece';
  ctx.font = '700 34px system-ui';
  ctx.fillText('SANAL KÜTÜPHANE', 360, 240, 500);
  ctx.font = '700 42px system-ui';
  ctx.fillText(profile.name, 360, 573, 500);
  ctx.font = 'bold 100px system-ui';
  ctx.fillStyle = '#ffc275';
  ctx.fillText(String(summary.minutes), 360, 740);
  ctx.font = '32px system-ui';
  ctx.fillStyle = '#ffeece';
  ctx.fillText('bugün odaklanılan dakika', 360, 799, 510);
  ctx.fillText(summary.streak + ' günlük seri', 360, 968);
  ctx.fillStyle = '#dfbca7';
  ctx.fillText(summary.date, 360, 1052);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('cardUnavailable');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sanal-kutuphane-' + summary.date + '.png';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
