import { informationPage } from './privacy-page.js';
import { words } from './public/strings.js';
import { siteHref, sitePages } from './public/site-pages.js';

export function featurePage(path, requestedLanguage, analyticsId) {
  const locale = requestedLanguage === 'en' ? 'en' : 'tr';
  const page = sitePages[path];
  const text = page[locale];
  const enter = locale === 'tr' ? 'Uygulamayı aç' : 'Open the app';
  return informationPage(locale, path, text.title, text.description, `
    <p>${text.description}</p>
    <img class="feature-cover" src="${page.image}" alt="" width="920" height="460" fetchpriority="high">
    ${text.sections.map(([title, body]) => `<section class="notice-section"><h2>${title}</h2><p>${body}</p></section>`).join('')}
    <a class="primary feature-entry" href="/?lang=${locale}#${page.route}">${enter}</a>
    <nav class="feature-links" aria-label="${locale === 'tr' ? 'Diğer özellikler' : 'Other features'}">
      ${Object.entries(sitePages).filter(([other]) => other !== path).map(([other, feature]) =>
        `<a class="secondary" href="${siteHref(other, locale)}">${feature[locale].title}</a>`).join('')}
    </nav>
    ${analyticsId ? `<div data-site-measurement></div><script type="module">
      import { createWebAnalytics } from '/web-analytics.js';
      const metrics = createWebAnalytics(${JSON.stringify(analyticsId)});
      document.querySelector('[data-site-measurement]').innerHTML = metrics.control(${JSON.stringify(words[locale].webMeasurement)});
      metrics.page(${JSON.stringify(siteHref(path, locale))}, document.title);
    </script>` : ''}`, true);
}

export function analyticsMeasurementId(env) {
  const id = env.GA_MEASUREMENT_ID?.trim();
  return /^G-[A-Z0-9]{4,16}$/.test(id ?? '') ? id : undefined;
}

export function addSiteVerification(html, env) {
  const tags = [
    ['google-site-verification', env.GOOGLE_SITE_VERIFICATION],
    ['msvalidate.01', env.BING_SITE_VERIFICATION],
  ].filter(([, value]) => /^[\w-]{8,160}$/.test(value?.trim() ?? ''));
  return html.replace('</head>', tags.map(([name, value]) => `<meta name="${name}" content="${value.trim()}">\n`).join('') + '</head>');
}
