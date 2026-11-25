import { words } from './public/strings.js';

const labels = {
  tr: {
    title: 'Gizlilik politikası',
    intro: 'Virtual Study Crew, hesabını yönetmek için e-posta adresini ve giriş sağlayıcını işler. Görünen adın, avatarın, çalışma hedefin, oda durumun, oturumların ve jeton işlemlerin hizmeti sunmak için saklanır.',
    people: 'Odadaki katılımcılar görünen adını, avatarını, oda durumunu ve paylaştığın çalışma hedefini görebilir. Haftalık sıralamaya katılırsan görünen adın ve doğrulanmış çalışma süren listelenir.',
    social: 'Arkadaşlık istekleri, çalışma davetleri, kullanıcı kodları ve ödül işlemleri ilgili özellikleri sunmak için işlenir. Ödüllü reklamı açtığında sağlayıcıya rastgele bir işlem kodu iletilir.',
    optional: 'Cihaz bildirimi ve kullanım ölçümü tercihe bağlıdır. Bildirimleri açarsan cihaz belirteci kaydedilir. Webde izin verirsen Google Analytics, ziyaret ettiğin sayfalar ve tarayıcı bilgileri üzerinden site kullanımını ölçer. Tercihini giriş ekranında veya profilinde değiştirebilirsin. Hata izleme yapılandırılmışsa uygulamanın çalışmasıyla ilgili hata kayıtları işlenir.',
    controller: 'Veri sorumlusu', contact: 'İletişim', details: 'Verilerin işlenmesi ve hakların',
    usage: 'Bu bilgileri oturum açmayı, çalışma odalarını, sayaçları, sosyal özellikleri ve envanteri çalıştırmak için kullanırız. Giriş yönteminize göre Google ve Firebase oturum açma sürecine katılabilir. Supabase kimlik doğrulama ve uygulama verilerini, Vercel web sitesini barındırır.',
    choices: 'Profilinden haftalık sıralamaya katılmayı seçebilir ve daha sonra listeden ayrılabilirsin. Bildirim ve kullanım ölçümü tercihlerini uygulamadan değiştirebilirsin. Çalışma hedefini boş bırakarak oda aramasından kaldırabilirsin.',
    retention: 'Hesap ve çalışma kayıtların hesabın açıkken ilgili özellikleri sunmak için tutulur. Hesabını sildiğinde profilin ve ona bağlı çalışma, envanter ve sosyal kayıtlar uygulamanın aktif veritabanından kaldırılır.',
    remove: 'Hesabımı ve verilerimi sil',
  },
  en: {
    title: 'Privacy policy',
    intro: 'Virtual Study Crew processes your email address and sign-in provider to manage your account. Your display name, avatar, study target, room status, sessions, and coin transactions are stored to provide the service.',
    people: 'Room participants can see your display name, avatar, room status, and shared study target. If you join the weekly ranking, your display name and verified study time are listed.',
    social: 'Friend requests, study invitations, user codes, and reward transactions are processed to provide these features. Starting a rewarded ad passes a random transaction code to the provider.',
    optional: 'Device notifications and usage measurement are optional. Enabling notifications registers a device token. If you opt in on the website, Google Analytics measures usage from pages you visit and browser information. You can change your choice on the sign-in screen or your profile. When error monitoring is configured, error reports are processed to maintain the application.',
    controller: 'Data controller', contact: 'Contact', details: 'Data processing and your rights',
    usage: 'We use this information to provide sign-in, study rooms, timers, social features, and inventory. Google and Firebase may participate in sign-in depending on the method you choose. Supabase hosts authentication and application data. Vercel hosts the website.',
    choices: 'You can join or leave the weekly ranking from your profile. The app lets you change your notification and usage measurement preferences. Clear your study target to remove it from room search.',
    retention: 'We keep account and study records while your account is open to provide these features. When you delete your account, your profile and related study, inventory, and social records are removed from the active application database.',
    remove: 'Delete my account and data',
  },
};

function escape(value = '') {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' })[char]);
}

export function informationPage(locale, path, title, description, content, feature = false) {
  const alternate = locale === 'en' ? 'tr' : 'en';
  const canonical = 'https://virtualstudycrew.com' + path;
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escape(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escape(title)} | Virtual Study Crew">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${canonical}${locale === 'en' ? '?lang=en' : ''}">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="canonical" href="${canonical}${locale === 'en' ? '?lang=en' : ''}">
<link rel="alternate" hreflang="tr" href="${canonical}">
<link rel="alternate" hreflang="en" href="${canonical}?lang=en">
<title>${title} | ${words[locale].app}</title>
</head>
<body class="notice-page"><main class="card account-card notice-card">
  <nav class="notice-toolbar" aria-label="${locale === 'tr' ? 'Sayfa seçenekleri' : 'Page options'}">
    <a class="secondary account-back" href="/?lang=${locale}${feature ? '' : '#profile'}"><span aria-hidden="true">←</span> ${feature ? (locale === 'tr' ? 'Ana sayfa' : 'Home') : words[locale].goBack}</a>
    <a class="secondary account-back" href="${path}?lang=${alternate}" lang="${alternate}">${alternate === 'tr' ? 'Türkçe' : 'English'}</a>
  </nav>
  <div class="notice-heading"><img class="auth-emblem" src="/app-logo.png" width="45" height="45" alt=""><h1>${title}</h1></div>
  <div class="notice-content">${content}</div>
</main></body></html>`;
}

export function privacyPage(requestedLanguage, env) {
  const locale = requestedLanguage === 'en' ? 'en' : 'tr';
  const text = labels[locale];
  const details = env[locale === 'tr' ? 'PRIVACY_DETAILS_TR' : 'PRIVACY_DETAILS_EN']?.trim();
  const controller = env.PRIVACY_CONTROLLER_NAME?.trim();
  const contact = env.PRIVACY_CONTACT_EMAIL?.trim();
  return informationPage(locale, '/privacy', text.title, text.intro, `
  <p>${text.intro}</p><p>${text.people}</p><p>${text.social}</p><p>${text.optional}</p>
  <h2>${text.details}</h2>
  <p>${text.usage}</p><p>${text.choices}</p><p>${text.retention}</p>
  ${controller ? `<p><b>${text.controller}</b> ${escape(controller)}</p>` : ''}
  ${contact ? `<p><b>${text.contact}</b> <a href="mailto:${escape(contact)}">${escape(contact)}</a></p>` : ''}
  ${details ? `<p class="notice-details">${escape(details)}</p>` : ''}
  <div class="notice-actions">
    <a class="secondary account-button account-danger" href="/account-deletion?lang=${locale}">${text.remove}</a>
    <a class="secondary account-button account-terms" href="/terms?lang=${locale}">${words[locale].terms}</a>
  </div>`);
}
