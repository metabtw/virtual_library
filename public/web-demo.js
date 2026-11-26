import { defaultAvatar } from './avatar-art.js';
import { demoClock, demoDurations, demoError } from './demo.js';
import { portrait } from './sprites.js';

export function mountDemo(host, { t, locale, getAccess, saveAccess, invoke, showTour, register }) {
  let state, observed, busy = false, selection = 25, showingGames = false, disposeGames, error = '';
  const controller = new AbortController();
  const { signal } = controller;
  host.innerHTML = `<section class="card demo-card">
    <div class="demo-header"><h1>${t('demoTitle')}</h1><button class="secondary" data-demo="register">${t('signInTitle')}</button></div>
    <div class="demo-layout">
      <div class="demo-scene"><img src="${portrait(defaultAvatar)}" width="68" alt=""><strong>${t('demoName')}</strong></div>
      <div class="demo-controls"><p>${t('demoIntro')}</p><div data-demo-status></div></div>
    </div>
    <div class="demo-actions"><button class="secondary" data-demo="tour">${t('tourOpen')}</button>
    <button class="secondary" data-demo="games" hidden>${t('games')}</button>
    <button class="primary" data-demo="register">${t('demoRegister')}</button></div>
    <div data-demo-games hidden><h1>${t('games')}</h1></div>
  </section>`;
  const panel = host.querySelector('[data-demo-status]');
  const games = host.querySelector('[data-demo-games]');
  const gamesButton = host.querySelector('[data-demo="games"]');
  const currentTime = () => state ? state.now + performance.now() - observed : Date.now();
  const checkDue = () => state?.verifyAt && state.verifyAt < state.endAt && currentTime() >= state.verifyAt;
  const expired = () => state && currentTime() >= state.expiresAt;

  function updateTime() {
    const update = (selector, value) => {
      const cell = panel.querySelector(selector);
      if (cell && cell.textContent !== value) cell.textContent = value;
    };
    gamesButton.hidden = !state || expired();
    if (!state) return;
    if (expired() && showingGames) closeGames();
    const now = currentTime();
    const previous = panel.querySelector('[data-demo="verify"]');
    if (previous) previous.hidden = !checkDue();
    const stop = panel.querySelector('[data-demo="stop"]');
    if (stop) stop.disabled = Boolean(checkDue());
    const prompt = panel.querySelector('[data-demo-check]');
    if (prompt) {
      prompt.hidden = !checkDue();
      update('[data-demo-check]', t('verify') + ' · ' + demoClock(state.verifyAt + 30000 - now));
    }
    update('[data-demo-left]', demoClock(state.expiresAt - now));
    update('[data-demo-focus]', demoClock(state.endAt - now));
    if (expired() && panel.querySelector('[data-demo="start"]') && !busy) paint();
  }

  function closeGames() {
    showingGames = false;
    games.hidden = true;
    disposeGames?.();
    disposeGames = undefined;
    games.innerHTML = `<h1>${t('games')}</h1>`;
  }

  function paint() {
    if (signal.aborted) return;
    const active = document.activeElement;
    const focused = panel.contains(active) && active.dataset.demo;
    panel.innerHTML = `<p class="demo-error" role="status">${error ? t(error) : ''}</p>` + (state ? `<dl class="demo-stats">
      <div><dt>${t('demoId')}</dt><dd><code>${state.id}</code></dd></div>
      <div><dt>${t('demoTime')}</dt><dd data-demo-left></dd></div>
      <div><dt>${t('demoTracked')}</dt><dd>${state.minutes} ${t('minuteUnit')}</dd></div></dl>
      ${state.endAt ? `<strong class="demo-timer" data-demo-focus></strong><small data-demo-check hidden></small>
          <button class="primary" data-demo="verify" hidden>${t('here')}</button>
          <button class="secondary" data-demo="stop">${t('demoStop')}</button>`
        : expired() ? `<p>${t('demoExpired')}</p>` : showingGames ? ''
          : `<label class="field">${t('focus')} <select data-demo-duration>${demoDurations.map(value =>
            `<option value="${value}" ${value === selection ? 'selected' : ''}>${value} ${t('minuteUnit')}</option>`).join('')}</select></label>
            <button class="primary" data-demo="start">${t('start')}</button>`}`
      : getAccess() ? `<button class="secondary" data-demo="state">${t('demoRetry')}</button>`
        : `<button class="primary" data-demo="create">${t('demoCreate')}</button>`);
    updateTime();
    if (focused) panel.querySelector(`[data-demo="${focused}"]`)?.focus({ preventScroll: true });
  }

  async function sync(operation) {
    if (busy || signal.aborted) return false;
    const access = getAccess();
    if (!access && operation !== 'create') return false;
    busy = true;
    host.setAttribute('aria-busy', 'true');
    try {
      const next = await (operation === 'create' ? invoke('demoStart')
        : invoke('demoEvent', { ...access, operation, duration: selection }));
      if (operation === 'create') saveAccess({ id: next.id, key: next.key });
      if (signal.aborted) return false;
      const changed = !state || ['endAt', 'verifyAt', 'expiresAt', 'minutes'].some(key => state[key] !== next[key]);
      state = next;
      observed = performance.now();
      const nextError = next.outcome === 'invalid' ? 'demoInvalid' : operation === 'state' && error === 'demoInvalid' ? error : '';
      if (changed || nextError !== error || operation !== 'state') {
        error = nextError;
        paint();
      }
      if (operation === 'create') showTour();
      return true;
    } catch (failure) {
      if (signal.aborted) return false;
      const nextError = demoError(failure);
      if (nextError === 'demoMissing') { saveAccess(null); state = null; }
      if (error !== nextError) { error = nextError; paint(); }
      return false;
    } finally { busy = false; host.removeAttribute('aria-busy'); }
  }

  host.addEventListener('change', event => {
    if (event.target.matches('[data-demo-duration]')) selection = Number(event.target.value);
  }, { signal });
  host.addEventListener('click', async event => {
    const action = event.target.closest('[data-demo]')?.dataset.demo;
    if (!action || busy || signal.aborted) return;
    if (action === 'tour') { showTour(); return; }
    if (action === 'register' || action === 'games') {
      if (state?.endAt && checkDue()) {
        panel.querySelector('[data-demo="verify"]')?.focus();
        return;
      }
      if (state?.endAt && !await sync('stop')) return;
      if (action === 'register') { register(); return; }
      if (!state || expired()) return;
      if (showingGames) closeGames();
      else {
        showingGames = true;
        games.hidden = false;
        try {
          const { mountGames, loadGameStyles } = await import('./web-games.js');
          await loadGameStyles();
          if (signal.aborted || !showingGames) return;
          disposeGames ??= mountGames(games, locale);
        } catch { error = 'server'; }
      }
      paint();
      return;
    }
    await sync(action);
  }, { signal });

  paint();
  const refresh = () => { if (getAccess() && !document.hidden) void sync('state'); };
  refresh();
  window.addEventListener('online', refresh, { signal });
  document.addEventListener('visibilitychange', refresh, { signal });
  const refreshTimer = setInterval(refresh, 8000);
  const clockTimer = setInterval(updateTime, 300);
  return () => {
    controller.abort();
    disposeGames?.();
    clearInterval(refreshTimer);
    clearInterval(clockTimer);
  };
}
