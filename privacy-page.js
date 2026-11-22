import { words } from './public/strings.js';

const labels = {
  tr: {
    title: 'Kişisel veri aydınlatması', language: 'English',
    intro: 'Virtual Study Crew, hesabını yönetmek için e-posta adresini ve giriş sağlayıcını işler. Görünen adın, avatarın, çalışma hedefin, oda durumun, oturumların ve jeton işlemlerin hizmeti sunmak için saklanır.',
    people: 'Odadaki katılımcılar görünen adını, avatarını, oda durumunu ve paylaştığın çalışma hedefini görebilir. Haftalık sıralamaya katılırsan görünen adın ve doğrulanmış çalışma süren listelenir.',
    social: 'Arkadaşlık istekleri, çalışma davetleri, kullanıcı kodları ve ödül işlemleri ilgili özellikleri sunmak için işlenir. Ödüllü reklamı açtığında sağlayıcıya rastgele bir işlem kodu iletilir.',
    optional: 'Cihaz bildirimi ve kullanım ölçümü tercihe bağlıdır. Bildirimleri açarsan cihaz belirteci kaydedilir. Hata izleme yapılandırılmışsa uygulamanın çalışmasıyla ilgili hata kayıtları işlenir.',
    controller: 'Veri sorumlusu', contact: 'İletişim', details: 'Verilerin işlenmesi ve hakların',
    draft: 'Bu taslak, yayın öncesinde veri sorumlusu, iletişim, işleme sebepleri, aktarım ve saklama bilgileriyle tamamlanır.',
    remove: 'Hesabımı ve verilerimi sil',
  },
  en: {
    title: 'Privacy notice', language: 'Türkçe',
    intro: 'Virtual Study Crew processes your email address and sign-in provider to manage your account. Your display name, avatar, study target, room status, sessions, and coin transactions are stored to provide the service.',
    people: 'Room participants can see your display name, avatar, room status, and shared study target. If you join the weekly ranking, your display name and verified study time are listed.',
    social: 'Friend requests, study invitations, user codes, and reward transactions are processed to provide these features. Starting a rewarded ad passes a random transaction code to the provider.',
    optional: 'Device notifications and usage measurement are optional. Enabling notifications registers a device token. When error monitoring is configured, error reports are processed to maintain the application.',
    controller: 'Data controller', contact: 'Contact', details: 'Data processing and your rights',
    draft: 'The data controller completes this draft with contact details, legal grounds, transfers, and retention information before publication.',
    remove: 'Delete my account and data',
  },
};

function escape(value = '') {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' })[char]);
}

export function privacyPage(requestedLanguage, env) {
  const locale = requestedLanguage === 'en' ? 'en' : 'tr';
  const text = labels[locale];
  const details = env[locale === 'tr' ? 'PRIVACY_DETAILS_TR' : 'PRIVACY_DETAILS_EN']?.trim();
  const controller = env.PRIVACY_CONTROLLER_NAME?.trim();
  const contact = env.PRIVACY_CONTACT_EMAIL?.trim();
  return `<!doctype html>
<html lang="${locale}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="/favicon.png" type="image/png">
<title>${text.title} | ${words[locale].app}</title>
<body class="notice-page"><main class="card account-card">
  <div class="notice-toolbar">
    <a class="secondary account-back" href="/?lang=${locale}#profile"><span aria-hidden="true">←</span> ${words[locale].goBack}</a>
    <a class="secondary account-back" href="/privacy?lang=${locale === 'tr' ? 'en' : 'tr'}">${text.language}</a>
  </div>
  <div class="auth-heading"><img class="auth-emblem" src="/app-logo.png" width="45" height="45" alt=""><h1>${text.title}</h1></div>
  <p>${text.intro}</p><p>${text.people}</p><p>${text.social}</p><p>${text.optional}</p>
  <h2>${text.details}</h2>
  ${controller ? `<p><b>${text.controller}</b> ${escape(controller)}</p>` : ''}
  ${contact ? `<p><b>${text.contact}</b> ${escape(contact)}</p>` : ''}
  ${details ? `<p class="notice-details">${escape(details)}</p>` : ''}
  ${controller && contact && details ? '' : `<p>${text.draft}</p>`}
  <a class="secondary account-button account-danger" href="/account-deletion?lang=${locale}">${text.remove}</a>
</main></body></html>`;
}
