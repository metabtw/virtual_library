export const siteName = 'Virtual Study Crew';

export const sitePages = {
  '/odalar': {
    image: '/room-themes/old-archive.webp', route: 'rooms',
    tr: {
      title: 'Sanal Çalışma Odaları',
      description: 'Sessiz sanal kütüphane odalarına katıl, çalışma hedefini paylaş veya arkadaşlarınla davet kodlu özel bir oda aç.',
      sections: [
        ['Herkese açık bir oda seç', 'Odalar listesinden katılımcı sayısını ve paylaşılan çalışma hedeflerini gör. Matematik, edebiyat veya gece kütüphanesi gibi odalardan birine yerleş.'],
        ['Kendi çalışma grubunu davet et', 'Özel bir oda açıp altı haneli kodu arkadaşlarınla paylaş. Davet kodun varsa Odalar sayfasındaki Özel odalar bölümünden katıl.'],
      ],
    },
    en: {
      title: 'Virtual Study Rooms',
      description: 'Join a quiet virtual library, share your study target, or open a private room for friends with an invite code.',
      sections: [
        ['Pick a public room', 'See room occupancy and shared study targets in the directory. Choose a room such as Mathematics, Literature, or the Night Library.'],
        ['Invite your study group', 'Open a private room and share its six-digit code with friends. Use the Private rooms section to join with a code.'],
      ],
    },
  },
  '/odak-zamanlayici': {
    image: '/library.webp', route: 'room',
    tr: {
      title: 'Odak Zamanlayıcısı ve Mola',
      description: '25, 50 veya 90 dakikalık hazır çalışma sürelerinden birini seç ya da kendi zamanlayıcını kur. Çalışman bitince mola otomatik başlar.',
      sections: [
        ['Çalışma ve mola sürelerini belirle', 'Hazır planlar 25/5, 50/10 ve 90/15 dakikadır. Özel bir plan seçtiğinde çalışma ve mola sürelerini ayrı ayrı belirleyebilirsin.'],
        ['Doğrulanan süreyi takip et', 'Çalışma sırasında ekrana gelen doğrulamayı tamamla. Bitirdiğin oturumların günlük ve haftalık toplamı profilinde görünür. Molan bitince çalışma odana dönersin.'],
      ],
    },
    en: {
      title: 'Focus Timer and Breaks',
      description: 'Choose a 25-, 50-, or 90-minute study session or set a custom timer. Your break starts automatically at the end of the session.',
      sections: [
        ['Set a study period and break', 'Choose a 25/5, 50/10, or 90/15 minute plan. With a custom plan, set the focus and break lengths separately.'],
        ['Track verified study time', 'Confirm attendance when prompted. Your profile shows daily and weekly totals for completed sessions. When a break ends, the app takes you back to your room.'],
      ],
    },
  },
  '/oyunlar': {
    image: '/room-themes/aurora-observatory.webp', route: 'games',
    tr: {
      title: 'Mola Oyunları',
      description: 'Molanda Kitap Kulesi, Kahve & Notlar veya Kağıt Uçak oyna. Piksel kütüphane oyunlarını klavye ya da dokunarak kontrol et.',
      sections: [
        ['Kitap Kulesi', 'Sallanan kitabı kulenin üstüne oturt. Tam hizalamada kitap genişliğini korur. Kenardan taşan parça düşer.'],
        ['Kahve & Notlar', 'Kâğıt, defter ve kitap gibi eşyaları yön tuşlarıyla veya kaydırarak birleştir.'],
        ['Kağıt Uçak', 'Basılı tutarak yüksel, bırakarak alçal. Gözlemevindeki ışıkları topla. Beşinci raf temasında tur biter.'],
      ],
    },
    en: {
      title: 'Study Break Games',
      description: 'Play Book Tower, Coffee & Notes, or Paper Plane on a break. Three pixel-library games with keyboard and touch controls.',
      sections: [
        ['Book Tower', 'Drop the moving book onto the stack. A perfect drop keeps the book wide. Overhanging pieces fall away.'],
        ['Coffee & Notes', 'Merge matching papers, notebooks, and books with arrow keys or a swipe.'],
        ['Paper Plane', 'Hold to rise, release to descend, and collect lights in the observatory. The fifth bump ends the flight.'],
      ],
    },
  },
};

const homeMeta = {
  tr: ['Çevrimiçi Çalışma ve Odak Odaları', 'Virtual Study Crew ile arkadaşlarınla sanal çalışma odalarına katıl, odak sayacını ayarla ve kendi piksel avatarınla birlikte ders çalış.'],
  en: ['Online Study Rooms and Focus Timer', 'Study with friends in a virtual library. Set a focus timer, customize your pixel avatar, and play short games on your breaks.'],
};
const accountMeta = {
  tr: {
    shop: ['Jeton Mağazası', 'Çalışarak kazandığın jetonlarla avatar ve masa eşyalarına göz at. Sandık ödüllerini ve olasılıklarını incele.'],
    profile: ['Profil ve Envanter', 'Çalışma toplamlarını, arkadaşlarını ve avatar envanterini yönet.'],
    ranking: ['Haftalık Çalışma Sıralaması', 'Doğrulanmış çalışma dakikalarına göre haftalık sıralamayı ve ilk üç ödülünü gör.'],
    deletion: ['Hesap ve Veri Silme', 'Virtual Study Crew hesabını ve ilişkili verilerini silmek için kimliğini doğrula.'],
  },
  en: {
    shop: ['Coin Shop', 'Browse pixel avatar and desk items, chest rewards, and reward odds.'],
    profile: ['Profile and Inventory', 'Manage your study totals, friends, and avatar inventory.'],
    ranking: ['Weekly Study Leaderboard', 'View weekly rankings by verified study minutes and prizes for the top three.'],
    deletion: ['Account and Data Deletion', 'Verify your identity to delete your Virtual Study Crew account and associated data.'],
  },
};

export function siteHref(path, locale) {
  return path + (locale === 'en' ? '?lang=en' : '');
}

export function pageMetadata(view, locale) {
  const lang = locale === 'en' ? 'en' : 'tr';
  const publicPage = Object.values(sitePages).find(page => page.route === view);
  const [heading, description] = publicPage
    ? [publicPage[lang].title, publicPage[lang].description]
    : Object.hasOwn(accountMeta[lang], view) ? accountMeta[lang][view] : homeMeta[lang];
  return { title: heading + ' | ' + siteName, description };
}
