const storageKey = 'vsc-web-measurement';

export function createWebAnalytics(id) {
  if (!id) return { control: () => '', page: () => {} };
  let allowed = false;
  try { allowed = localStorage.getItem(storageKey) === 'yes'; } catch {}
  let currentPage;
  let previousPage;
  let initialized = false;
  const disabled = 'ga-disable-' + id;

  function send() {
    if (!allowed || !currentPage || previousPage?.url === currentPage.url) return;
    if (!initialized) {
      initialized = true;
      window.dataLayer ??= [];
      window.gtag ??= function () { window.dataLayer.push(arguments); };
      window.gtag('consent', 'default', {
        analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      });
      window.gtag('js', new Date());
      window.gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
      document.head.append(script);
    }
    const entry = { page_title: currentPage.title, page_location: currentPage.url, page_referrer: '' };
    window.gtag('event', 'page_view', entry);
    previousPage = currentPage;
  }

  function refreshControls() {
    for (const button of document.querySelectorAll('[data-analytics-toggle]')) button.setAttribute('aria-checked', String(allowed));
  }

  window[disabled] = !allowed;
  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-analytics-toggle]')) return;
    allowed = !allowed;
    try { localStorage.setItem(storageKey, allowed ? 'yes' : 'no'); } catch {}
    window[disabled] = !allowed;
    previousPage = undefined;
    if (initialized) window.gtag('consent', 'update', { analytics_storage: allowed ? 'granted' : 'denied' });
    if (!allowed) {
      const canonical = 'virtualstudycrew.com';
      const domain = location.hostname === canonical || location.hostname.endsWith('.' + canonical) ? '; Domain=' + canonical : '';
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim();
        if (!/^_ga(?:_|$)/.test(name)) continue;
        document.cookie = name + '=; Max-Age=0; Path=/';
        if (domain) document.cookie = name + '=; Max-Age=0; Path=/' + domain;
      }
    }
    refreshControls();
    send();
  });
  return {
    control(label) {
      return `<button type="button" class="secondary analytics-preference" role="switch" aria-checked="${allowed}" data-analytics-toggle>${label}</button>`;
    },
    page(path, title) {
      currentPage = path ? { url: location.origin + path, title } : undefined;
      send();
    },
  };
}
