import { informationPage } from './privacy-page.js';
import { words } from './public/strings.js';

const sections = {
  tr: [
    ['Hesap ve çalışma odaları', 'Virtual Study Crew çevrimiçi çalışma odaları, odak sayacı ve çalışma hedefleri sunar. Hesabını kendi giriş bilgilerinle kullan ve kodlarını paylaşma. Çalışma süresi, uygulama içinde tamamlanan ve gerektiğinde doğrulanan oturumlardan hesaplanır.'],
    ['Topluluk kuralları', 'Diğer katılımcıların çalışma alanına saygı göster. Taciz, spam, başkasının kimliğine bürünme, kişisel bilgi paylaşma ve süre ya da ödül sistemini manipüle etme yasaktır. İhlal halinde ilgili içerik veya hesap üzerinde işlem yapılabilir.'],
    ['Jetonlar, kutular ve envanter', 'Jetonlar uygulama içi ödüllerdir. Nakit değeri yoktur ve başka hesaba devredilemez. Her kutunun jeton bedeli ve ödül olasılıkları açmadan önce mağazada gösterilir. Kutunun havuzundan kazandığın eşyalar sonraki çekilişten çıkarılır ve kalan eşyaların olasılıkları yeniden hesaplanır.'],
    ['Hesabını kapatma', 'Hesabını profil ayarlarından silebilirsin. Hesap silindiğinde çalışma geçmişi, jetonlar ve envanter hesabınla birlikte kaldırılır. Kişisel verilerin işlenmesine ilişkin bilgileri gizlilik politikasında bulabilirsin.'],
  ],
  en: [
    ['Accounts and study rooms', 'Virtual Study Crew provides online study rooms, a focus timer, and study goals. Use your own sign-in details and keep your codes private. Study time is calculated from sessions completed in the app and verified when required.'],
    ['Community rules', 'Respect the other people in your study room. Harassment, spam, impersonation, sharing private information, and manipulating timers or rewards are prohibited. Violations may lead to action on the account or content involved.'],
    ['Coins, boxes, and inventory', 'Coins are in-app rewards. They have no cash value and cannot be transferred between accounts. The shop displays the price and odds before you open a box. Items you earn are removed from subsequent draws in that box and the remaining odds are recalculated.'],
    ['Closing your account', 'You can delete your account from the profile settings. Deleting your account removes its study history, coins, and inventory. The privacy policy explains how your personal information is handled.'],
  ],
};

export function termsPage(requestedLanguage) {
  const locale = requestedLanguage === 'en' ? 'en' : 'tr';
  const text = words[locale];
  return informationPage(locale, '/terms', text.terms, sections[locale][0][1], `
    ${sections[locale].map(([title, body]) => `<section class="notice-section"><h2>${title}</h2><p>${body}</p></section>`).join('')}
    <div class="notice-actions">
      <a class="secondary account-button account-data" href="/privacy?lang=${locale}">${text.readPrivacy}</a>
      <a class="secondary account-button account-danger" href="/account-deletion?lang=${locale}">${text.deleteAccount}</a>
    </div>`);
}
