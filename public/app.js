import { coinReasonLabels, readCoinReceipts, takeNextCoinAward } from './coin-notices.js';
import { createAccountDialogs } from './account-dialogs.js';
import { loadingPixels, tourSteps } from './onboarding.js';
import { defaultRoomTheme, roomBackdrop } from './room-art.js';
import { createClient } from './supabase-web.js';
import { config } from './config.js';
import { createRoomConnection, emailAuthMessage, invokeLibrary } from './library-client.js';
import { focusRemaining, markServerTime, serverTimeAt, verificationRemaining } from './focus-clock.js';
import { displayDeskStatuses, recordDeskStatus } from './desk-status.js';
import { portrait, propImage, writingFrames } from './sprites.js';
import { avatarOptions, avatarPresets, defaultAvatar, deskEquipment, dressedAvatar, hairStyles,
  hasPropArt, petAppearance, pickAvatarStyle, writingSize } from './avatar-art.js';
import { createRoomPreferences } from './room-preferences.js';
import { createStudyCardPreview, messageFor, reactionArt } from './web-social.js';
import { webText } from './web-strings.js';
import { adCooldownSeconds, boxArt, boxLabels, boxOdds, breakPresets, canBuyFromShop, roomGoalMinutes, roomProgressMinutes, roomThemeUnlockMinutes } from './study-rewards.js';
import { focusQuests, friendsPanel, studyInviteButton, studyInvitations } from './community.js';
import { demoError, demoStorageKey, parseDemo } from './demo.js';
import { preloadImage, waitForPage } from './page-loading.js';
import { pageMetadata, siteHref, sitePages } from './site-pages.js';
import { createWebAnalytics } from './web-analytics.js';
import { readMeetId } from './study-together.js';
import { inviteWait, splitProfileCode } from './room-social.js';

const client = config && createClient(config.url, config.key, {
  auth: { flowType: 'pkce', detectSessionInUrl: false },
});
let authReady = !client;
let tourIndex = 0;
const deletionPage = location.pathname === '/account-deletion';
const meetingId = () => !deletionPage && location.hash.startsWith('#meet/') ? readMeetId(location.hash) : null;
if (!location.hash && new URLSearchParams(location.search).has('code') && !deletionPage) {
  try {
    const remembered = readMeetId(sessionStorage.getItem('vsc-meet-pending'));
    if (remembered) history.replaceState(null, '', '#meet/' + remembered);
  } catch {}
}
const content = document.querySelector('#content');
const pageLoader = document.querySelector('#page-transition');
let currentView;
let pageTransition = 0;
let renderedDemo;
let renderedTogether;
let tourMode;
let demoLogin = false;
let demoAccess;
try { demoAccess = parseDemo(localStorage.getItem(demoStorageKey)); } catch {}
let claimRequest;
function saveDemoAccess(access) {
  demoAccess = access;
  try {
    if (access) localStorage.setItem(demoStorageKey, JSON.stringify(access));
    else localStorage.removeItem(demoStorageKey);
  } catch {}
}

async function claimDemo(actor, access) {
  if (!access || !actor || claimRequest || deletionPage) return;
  const claim = {};
  claimRequest = claim;
  try {
    const result = await invokeLibrary(client, 'demoClaim', access);
    if (userId !== actor || demoAccess?.id !== access.id) return;
    saveDemoAccess(null);
    planner?.refresh();
    toast(t('demoClaimed').replace('{minutes}', result.minutes));
    refreshState();
  } catch (error) {
    if (userId !== actor || demoAccess?.id !== access.id) return;
    const message = demoError(error);
    if (['demoAccountUsed', 'demoMissing', 'demoImported'].includes(message)) {
      saveDemoAccess(null);
      toast(t(message));
    }
  } finally {
    if (claimRequest === claim) claimRequest = undefined;
  }
}
const tourDialog = document.querySelector('#onboarding-dialog');
const notice = document.querySelector('#notice');
const coinNotice = document.querySelector('#coin-notice');
let coinReceipts = new Set();
let coinNoticeUntil = 0;
const seenCups = new Set();
const connectionBanner = document.querySelector('#connection-banner');
const breakBanner = document.querySelector('#break-banner');
const cardDialog = document.querySelector('#study-card-dialog');
let cardUrl;
let cardFile;
let cardModel;
let cardGeneration = 0;
let renderedGames;
let planner;
let plannerLocale;
let chosenPlan = '';
const reminderIds = new Set();
const verification = document.querySelector('#verify-dialog');
const reactionDialog = document.querySelector('#reaction-dialog');
const inviteDialog = document.querySelector('#study-invite-dialog');
const coinHelp = document.querySelector('#coin-help-dialog');
const rewardDialog = document.querySelector('#box-reward-dialog');
const rewardStage = rewardDialog.querySelector('.reward-stage');
const rewardResult = rewardDialog.querySelector('.reward-result');
const rewardHeading = rewardDialog.querySelector('h2');
const rewardButton = rewardDialog.querySelector('button');
const expandedPanels = new Set();
let revealTimer;
const shareCodeDialog = document.querySelector('#share-code-dialog');
const shareCodeText = document.querySelector('#share-code-text');
const shareCodeStatus = document.querySelector('#share-code-status');
const languageToggle = document.querySelector('#language-toggle');
const labels = { room: 'library', rooms: 'rooms', shop: 'shop', profile: 'profileInventory', ranking: 'leaderboard', games: 'games', together: 'together', meet: 'meetTitle' };
const palette = ['#bd7050', '#789078', '#7988ab', '#ad7963'];
const categories = {
  all: 'catalogAll', wearable: 'catalogClothes', hair: 'catalogHair', desk: 'catalogDesk',
  pet: 'catalogPets', ambience: 'catalogSound', rare: 'catalogChests',
};
const draft = { email: '', code: '', avatarName: null, roomName: '', invite: '', referral: '', friendCode: '' };
const seenReactions = new Set();
const roomConnection = createRoomConnection();
let locale = initialLanguage();
const t = key => webText(locale, key);
const metrics = createWebAnalytics(config?.analyticsId);
const description = document.querySelector('meta[name="description"]');
const roomPreferences = createRoomPreferences({ translate: t });

let userId;
let accessToken;
let data;
let clock;
let revision = 0;
let busy = false;
let refreshing = false;
let presence;
let presenceRoom;
let presenceReady = false;
let deskUpdates = new Map();
let noticeTimeout;
let pendingPauseAt;
let stateRequest;
let refreshRequested = false;
let lastRead = 0;
let lastView;
let lastScene;
let avatar = { ...defaultAvatar };
let editing = false;
let durationChoice = '50';
let customDuration = '35';
let customBreak = '5';
let disconnected = false;
let connectionExpired = false;
let expiredLocally = false;
let returnedBreak;
let emailSentTo = '';
let emailRetryAt = 0;
let emailFeedback = '';
let selectedDesk;
let lastInviteOptions;
let ranking;
let rankingRequest;
let roomSearch = '';
let openingAd = false;
let referralPrefix = 'DV';
const catalogCategory = { shop: 'all', inventory: 'all' };

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const duration = () => Number(durationChoice === 'custom' ? customDuration : durationChoice);
const breakLength = () => Number(durationChoice === 'custom' ? customBreak : breakPresets[durationChoice]);
const validDuration = () => Number.isInteger(duration()) && duration() >= 5 && duration() <= 180
  && Number.isInteger(breakLength()) && breakLength() >= 1 && breakLength() <= 60;
const onBreak = () => data?.autoBreak?.endsAt > now();
const session = () => !expiredLocally && data?.session?.state === 'active' ? data.session : null;
const running = () => session()?.paused_at === null;
const placed = () => data.inventory.filter(entry => entry.placed).map(entry => entry.item);
const now = () => clock ? serverTimeAt(clock) : 0;
const localName = item => locale === 'en' ? item.name_en || item.name : item.name;
const privacyHref = () => '/privacy?lang=' + locale;
const termsHref = () => '/terms?lang=' + locale;
const deletionHref = () => '/account-deletion?lang=' + locale;
const accountDialogs = createAccountDialogs({
  t,
  invoke: (action, payload) => invokeLibrary(client, action, payload),
  deleted: () => closeSession(true),
});

function updateCoinNotice() {
  const time = performance.now();
  if (coinNoticeUntil > time) return;
  if (coinNotice.firstChild) coinNotice.replaceChildren();
  if (!data || document.hidden || document.querySelector('dialog[open]')) return;
  const award = takeNextCoinAward(data.coinAwards, coinReceipts);
  if (!award) return;
  try { localStorage.setItem('vsc-coin-receipts-' + userId, JSON.stringify([...coinReceipts])); } catch {}
  const card = document.createElement('div');
  card.className = 'coin-banner';
  const icon = document.createElement('span');
  icon.textContent = '◉';
  icon.setAttribute('aria-hidden', 'true');
  const amount = document.createElement('strong');
  amount.textContent = t('coinEarned').replace('{amount}', new Intl.NumberFormat(locale).format(award.amount));
  const reason = document.createElement('span');
  reason.textContent = t(coinReasonLabels[award.reason]);
  card.append(icon, amount, reason);
  coinNotice.append(card);
  coinNoticeUntil = time + 4800;
}

function quietModeToggle() {
  const enabled = Boolean(data.profile.doNotDisturb);
  return `<button type="button" class="secondary quiet-chip" role="switch" aria-label="${t('quietMode')}"
    aria-checked="${enabled}" title="${t('quietModeHelp')}" data-action="setDoNotDisturb">
    <span aria-hidden="true">☾</span> <span>${t('quietMode')}</span>
    <strong>${t(enabled ? 'quietOn' : 'quietOff')}</strong></button>`;
}

function loadingScreen() {
  return `<div class="startup-screen" role="status" aria-label="${t('loading')}">
    <div class="startup-mark"><div class="startup-ring" aria-hidden="true">${loadingPixels.map(pixel =>
      `<i style="left:${pixel.x}px;top:${pixel.y}px;opacity:${pixel.opacity}"></i>`).join('')}</div>
      <img src="/app-mark.webp" width="126" height="126" alt=""></div>
    <p>${t('loading')}</p>
  </div>`;
}

function showTour(index, mode = tourMode ?? 'profile', focus = 'tab') {
  const step = tourSteps[index];
  tourMode = mode;
  tourIndex = index;
  const picture = '/tour/' + step.image + '.webp';
  const wasOpen = tourDialog.open;
  tourDialog.innerHTML = `<div class="tour-header">
      <span class="tour-welcome">${t('tourOpen')}</span>
      <button class="secondary" type="button" data-tour="skip">${t('tourSkip')}</button>
    </div>
    <nav class="tour-tabs" aria-label="${t('tourOpen')}">${tourSteps.map((item, n) =>
      `<button class="secondary" type="button" data-tour="${n}" aria-label="${n + 1}. ${t(item.title)}" ${n === index ? 'aria-current="step"' : ''}>${n + 1}</button>`).join('')}</nav>
    <div class="tour-copy"><h2 id="onboarding-title">${t(step.title)}</h2><p>${t(step.body)}</p></div>
    <a class="tour-visual" href="${picture}" target="_blank" rel="noopener" aria-label="${t('tourOpenImage')}">
      <img class="tour-art" src="${picture}" alt="${t(step.title)}">
      <span aria-hidden="true" class="tour-expand">↗</span>
    </a>
    <div class="tour-actions">
      <button class="secondary" type="button" data-tour="back" ${!index ? 'disabled' : ''}>${t('tourPrevious')}</button>
      <span aria-hidden="true">${index + 1} / ${tourSteps.length}</span>
      <button class="primary" type="button" data-tour="next" autofocus>${t(index + 1 === tourSteps.length ? 'tourStart' : 'tourNext')}</button>
    </div>`;
  if (!wasOpen) tourDialog.showModal();
  const strip = tourDialog.querySelector('.tour-tabs');
  const selected = strip.querySelector('[aria-current="step"]');
  strip.scrollLeft = selected.offsetLeft - strip.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2;
  if (wasOpen) {
    const control = focus === 'tab' ? selected : tourDialog.querySelector(`[data-tour="${focus}"]:not([disabled])`) ?? selected;
    control.focus({ preventScroll: true });
  }
}

async function finishTour() {
  if (tourMode === 'profile' && !await request('finishTour')) return;
  tourDialog.close();
  tourMode = undefined;
  tourIndex = 0;
}

tourDialog.addEventListener('click', event => {
  const action = event.target.closest('[data-tour]')?.dataset.tour;
  if (!action || busy) return;
  if (action === 'next' && tourIndex + 1 < tourSteps.length) showTour(tourIndex + 1, tourMode, 'next');
  else if (action === 'back') showTour(tourIndex - 1, tourMode, 'back');
  else if (/^\d+$/.test(action)) showTour(Number(action));
  else void finishTour();
});
tourDialog.addEventListener('cancel', event => {
  event.preventDefault();
  if (!busy) void finishTour();
});

const profileHref = () => '/?lang=' + locale + '#profile';

function termsButton() {
  return `<a class="secondary account-button account-terms" href="${termsHref()}">${t('terms')}</a>`;
}

function revealBoxReward() {
  clearTimeout(revealTimer);
  rewardStage.hidden = true;
  rewardResult.hidden = false;
  rewardHeading.textContent = t('prize');
  rewardButton.textContent = t('done');
}

function showBoxReward(drop, tier) {
  const prize = data.items.find(item => item.id === drop.item);
  const name = prize ? localName(prize) : drop.item ?? drop.coins + ' ' + t('coins');
  rewardDialog.dataset.tier = tier;
  const source = propImage(boxArt[tier] ?? boxArt.basic);
  rewardStage.querySelectorAll('img').forEach(image => { image.src = source; });
  rewardResult.innerHTML = `<div class="item-preview">${prize ? itemImage(prize) : '<span class="reward-coins" aria-hidden="true">◉</span>'}</div><strong>${escape(name)}</strong>`;
  rewardStage.hidden = false;
  rewardResult.hidden = true;
  rewardHeading.textContent = t('boxOpening');
  rewardButton.textContent = t('boxReveal');
  rewardDialog.showModal();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) revealBoxReward();
  else revealTimer = setTimeout(revealBoxReward, 1300);
}

rewardButton.addEventListener('click', () => {
  if (rewardResult.hidden) revealBoxReward();
  else rewardDialog.close();
});
rewardDialog.addEventListener('close', () => clearTimeout(revealTimer));

content.addEventListener('toggle', event => {
  const panel = event.target;
  const id = panel.dataset.disclosure;
  if (!id || !panel.isConnected) return;
  if (panel.open) {
    expandedPanels.add(id);
    if (id === 'planner') mountPlannerHost(panel.querySelector('[data-study-planner]'));
  }
  else expandedPanels.delete(id);
}, true);

function backToProfile() {
  return `<a class="secondary account-back" href="${profileHref()}"><span aria-hidden="true">←</span> ${t('goBack')}</a>`;
}

function initialLanguage() {
  const requested = new URLSearchParams(location.search).get('lang');
  const valid = requested === 'en' || requested === 'tr';
  try {
    if (valid) localStorage.setItem('library-language', requested);
    else return localStorage.getItem('library-language') === 'en' ? 'en' : 'tr';
  } catch { /* Use the URL language or the default when storage is unavailable. */ }
  return valid ? requested : 'tr';
}

function translateChrome() {
  document.documentElement.lang = locale;
  document.title = deletionPage ? t('deleteAccount') + ' | Virtual Study Crew' : t('siteTitle');
  document.querySelector('nav').setAttribute('aria-label', t('menu'));
  content.setAttribute('aria-label', t('library'));
  for (const element of document.querySelectorAll('[data-text]')) element.textContent = t(element.dataset.text);
  languageToggle.lang = locale === 'en' ? 'tr' : 'en';
  languageToggle.textContent = languageToggle.lang.toUpperCase();
  languageToggle.setAttribute('aria-label', locale === 'en' ? 'Türkçeye geç' : 'Switch to English');
}

function toast(message) {
  delete notice.dataset.incomingReaction;
  notice.textContent = message;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { notice.textContent = ''; }, 4500);
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* The browser may restrict clipboard access to trusted origins. */ }
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  const active = document.activeElement;
  (shareCodeDialog.open ? shareCodeDialog : document.body).append(field);
  field.select();
  try { return document.execCommand('copy'); }
  catch { return false; }
  finally { field.remove(); active?.focus({ preventScroll: true }); }
}

async function shareProfileCode(code, label) {
  const title = t('app');
  await shareText(title, `${title} · ${label} ${code}`);
}

async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  if (!data?.profile || running()) return;
  shareCodeText.value = text;
  shareCodeStatus.textContent = '';
  shareCodeDialog.querySelector('a').href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
  shareCodeDialog.showModal();
}

function clearReactionNotice() {
  if (!notice.dataset.incomingReaction) return;
  notice.textContent = '';
  delete notice.dataset.incomingReaction;
}

function refreshState() {
  refreshRequested = true;
  if (!document.hidden) void request('state');
}

function trackPresence(channel, time) {
  if (!channel) return;
  void channel.track({ changed: time }).then(result => {
    if (presence === channel) presenceReady = result === 'ok' && channel.state === 'joined';
  });
}

function sendRoomPresence(mode) {
  const room = data?.profile?.room;
  if (!room || !accessToken) return Promise.resolve();
  return fetch(`${config.url}/functions/v1/library`, {
    method: 'POST', keepalive: true,
    headers: { Authorization: `Bearer ${accessToken}`, apikey: config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'roomPresence', payload: { ...roomConnection.payload(), room, mode } }),
  }).catch(() => {});
}

function syncPresence() {
  const room = data?.profile?.room;
  if (room === presenceRoom) return;
  if (presence) void client.removeChannel(presence);
  presence = undefined;
  presenceReady = false;
  deskUpdates = new Map();
  presenceRoom = room;
  if (!room || !userId) return;
  const channel = client.channel('room:' + room, { config: { private: true, presence: { key: userId } } });
  presence = channel;
  channel.on('presence', { event: 'sync' }, refreshState)
    .on('broadcast', { event: 'room_membership' }, refreshState)
    .on('broadcast', { event: 'desk_activity' }, ({ payload }) => {
      if (presence !== channel) return;
      const next = recordDeskStatus(deskUpdates, payload);
      if (next === deskUpdates) return;
      deskUpdates = next;
      render();
      if (data.members.some(member => member.own && member.desk_ref === payload.desk && (member.activity ?? member.status) !== payload.status)) {
        refreshState();
      }
    })
    .subscribe(status => {
      if (presence !== channel) return;
      presenceReady = false;
      if (status === 'SUBSCRIBED') trackPresence(channel, Date.now());
    });
}

async function request(action, payload) {
  if (!userId || busy || deletionPage) return false;
  if (disconnected && expiredLocally && action !== 'state') return false;
  const mutation = action !== 'state';
  if (!mutation && stateRequest) return false;
  if (mutation) { busy = true; revision++; }
  const read = {};
  if (!mutation) { stateRequest = read; lastRead = performance.now(); refreshRequested = false; }
  const version = revision;
  try {
    const result = await invokeLibrary(client, action, { ...payload, ...roomConnection.payload(), foreground: !document.hidden });
    if (version !== revision || (data && result.now < data.now)) return false;
    const lostRoom = disconnected && data?.profile?.room && !result.profile?.room && data.session?.disconnectDeadline;
    const oldRoom = data?.rooms.find(room => room.id === data.profile?.room);
    const timedRoomClosed = oldRoom?.expiresAt && result.now >= oldRoom.expiresAt && !result.profile?.room;
    const completed = data?.session?.state !== result.session?.state && result.session?.state === 'completed';
    if (completed) toast(t('reward'));
    if (!timedRoomClosed && !lostRoom && data?.session?.state === 'active' && result.session?.state === 'invalid') toast(t('invalid'));
    const missedFriends = data?.profile?.doNotDisturb && !result.profile?.doNotDisturb
      ? result.friends?.filter(friend => friend.status === 'incoming').length : 0;
    if (result.profile?.doNotDisturb && !data?.profile?.doNotDisturb) clearReactionNotice();
    disconnected = expiredLocally = false;
    if (lostRoom) {
      connectionExpired = true;
      location.hash = 'rooms';
    }
    if (timedRoomClosed) {
      connectionExpired = false;
      location.hash = 'rooms';
      toast(t('privateRoomExpired'));
    }
    if (result.profile?.room) connectionExpired = false;
    data = result;
    if (result.profile) void claimDemo(userId, demoAccess);
    if (completed) planner?.refresh();
    clock = markServerTime(result.now);
    refreshing = false;
    syncPresence();
    if (document.hidden && result.profile?.room) void sendRoomPresence('background');
    const incoming = (result.reactions ?? []).filter(event => !seenReactions.has(event.id));
    for (const event of incoming) seenReactions.add(event.id);
    if (seenReactions.size > 128) for (const id of [...seenReactions].slice(0, 64)) seenReactions.delete(id);
    if (incoming.length && !data.profile?.doNotDisturb) {
      toast(incoming.map(event =>
        `${reactionArt[event.kind]} ${event.name} ${t(event.kind === 'coffee' ? 'coffeeReceived' : 'clapReceived')}`).join(' · '));
      notice.dataset.incomingReaction = 'true';
    }
    if (missedFriends) toast(t('newFriendCount').replace('{amount}', missedFriends));
    if (result.drop) showBoxReward(result.drop, result.drop.tier ?? payload?.tier ?? 'basic');
    if (['place', 'profile', 'react', 'addDeskFriend', 'setDoNotDisturb'].includes(action)) trackPresence(presence, result.now);
    return true;
  } catch (error) {
    if (version === revision && error.message === 'networkUnavailable' && data?.profile?.room) disconnected = true;
    if (version === revision && (mutation || !data) && !disconnected) {
      const message = messageFor(error.message, t);
      if ((action === 'react' || action === 'addDeskFriend') && reactionDialog.open) {
        reactionDialog.querySelector('[data-desk-feedback]').textContent = message;
      } else toast(message);
    }
    if (error.message === 'boxPriceChanged') refreshRequested = true;
    return false;
  } finally {
    if (stateRequest === read) stateRequest = undefined;
    if (version === revision) {
      if (mutation) busy = false;
      render();
    }
    if (refreshRequested && !document.hidden) void request('state');
  }
}

function reflectSession(next) {
  accessToken = next?.access_token;
  const id = next?.user?.id;
  if (id === userId && lastView !== undefined && authReady) return;
  if (id && !userId && authReady && !deletionPage && !meetingId()) history.replaceState(null, '', '#rooms');
  authReady = true;
  revision++;
  userId = id;
  planner?.close();
  planner = undefined;
  chosenPlan = '';
  reminderIds.clear();
  data = clock = ranking = rankingRequest = returnedBreak = undefined;
  disconnected = connectionExpired = expiredLocally = false;
  if (cardDialog.open) cardDialog.close();
  busy = refreshing = editing = false;
  avatar = { ...defaultAvatar };
  draft.avatarName = null;
  draft.roomName = draft.invite = draft.referral = draft.friendCode = '';
  referralPrefix = 'DV';
  stateRequest = undefined;
  refreshRequested = false;
  roomSearch = '';
  catalogCategory.shop = catalogCategory.inventory = 'all';
  expandedPanels.clear();
  if (rewardDialog.open) rewardDialog.close();
  if (tourDialog.open) tourDialog.close();
  tourMode = undefined;
  tourIndex = 0;
  lastRead = 0;
  lastView = lastScene = undefined;
  seenReactions.clear();
  seenCups.clear();
  coinNoticeUntil = 0;
  coinNotice.replaceChildren();
  coinReceipts = new Set();
  if (id) {
    try { coinReceipts = readCoinReceipts(localStorage.getItem('vsc-coin-receipts-' + id)); } catch {}
  }
  emailSentTo = emailFeedback = draft.code = '';
  emailRetryAt = 0;
  syncPresence();
  render();
  if (id && !deletionPage) void request('state');
}

function featureLinks() {
  return `<nav class="feature-links" aria-label="${t('featureLinks')}">${Object.entries(sitePages).map(([path, page]) =>
    `<a class="secondary" href="${siteHref(path, locale)}">${page[locale].title}</a>`).join('')}</nav>`;
}

function updatePageMetadata(view) {
  const meta = pageMetadata(view, locale);
  if (document.title !== meta.title) document.title = meta.title;
  if (description.content !== meta.description) description.content = meta.description;
  metrics.page(view === 'deletion' ? undefined : view === 'home' ? '/' : '/#' + view, meta.title);
}

function signInView() {
  if (!client) return `<section class="card account-card">${deletionPage ? backToProfile() : ''}
    <h1>${t('app')}</h1><p>${t('missingConfig')}</p><div class="auth-links"><a class="secondary account-button account-data" href="${privacyHref()}">${t('readPrivacy')}</a>${termsButton()}</div></section>`;
  return `<section class="card account-card auth-card">
    <div class="auth-heading"><img class="auth-emblem" src="/app-mark.webp" width="45" height="45" alt=""><h1>${t(deletionPage ? 'deleteAccount' : 'signInTitle')}</h1></div>
    ${deletionPage ? '' : `<p>${t('siteIntro')}</p>
      ${demoLogin && demoAccess ? `<p class="demo-transfer-note" role="status">${t('demoPending')}</p>` : ''}
      <div class="demo-entry"><a class="primary" href="#demo">${t(demoAccess ? 'demoContinue' : 'demoTry')}</a>
      <button class="secondary" data-action="open-tour">${t('tourOpen')}</button></div>`}
    ${meetingId() ? '<div data-study-together></div>' : ''}
    ${config.google || config.apple ? `<div class="auth-providers">
      ${config.google ? `<button class="secondary" data-action="oauth" data-value="google">${t('google')}</button>` : ''}
      ${config.apple ? `<button class="secondary" data-action="oauth" data-value="apple">${t('apple')}</button>` : ''}
    </div>` : ''}
    ${emailSentTo ? `<p>${t('emailSent')}<strong class="auth-address">${escape(emailSentTo)}</strong></p>
      <form id="code-form" class="stacked"><label class="field">${t('code')} <input id="email-code" name="code" type="text" required
        inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" value="${escape(draft.code)}"></label>
        <button class="primary">${t('confirmCode')}</button></form>
      <div class="auth-code-tools">
        <form id="email-form"><button class="secondary" id="resend-email">${t('resend')}</button></form>
        <button class="secondary" data-action="change-email">${t('changeEmail')}</button>
      </div>` : `<p>${t(deletionPage ? 'deletionSignIn' : 'emailPrompt')}</p>
      <form id="email-form" class="stacked">
        <label class="field">${t('email')} <input id="sign-in-email" type="email" name="email" required autocomplete="email" value="${escape(draft.email)}"></label>
        <button class="primary">${t('sendEmail')}</button>
      </form>`}
    ${emailFeedback ? `<p class="auth-feedback" role="alert">${t(emailFeedback)}</p>` : ''}
    <div class="auth-links"><a class="secondary account-button account-data" href="${privacyHref()}">${t('readPrivacy')}</a>
    ${termsButton()}
    ${deletionPage ? backToProfile() : `<a class="secondary account-button account-danger" href="${deletionHref()}">${t('deletionPage')}</a>`}</div>
    ${deletionPage ? '' : metrics.control(t('webMeasurement'))}
    ${deletionPage ? '' : featureLinks()}
  </section>`;
}

function deletionView() {
  return `<section class="card account-card">
    ${backToProfile()}
    <h1>${t('deleteAccount')}</h1><p>${t('deletionWarning')}</p>
    <button class="secondary account-button account-danger" data-action="delete-account">${t('deleteAccount')}</button>
  </section>`;
}

function picker(name, label, value, choices) {
  const [, selected] = choices.find(([choice]) => String(choice) === String(value)) ?? choices[0];
  return `<div class="field"><span id="label-${name}">${label}</span><details class="picker" data-picker="${name}">
    <summary aria-labelledby="label-${name} value-${name}"><span id="value-${name}">${selected}</span></summary>
    <div class="picker-options" role="group" aria-labelledby="label-${name}">${choices.map(([choice, text]) =>
      `<button type="button" data-choice="${choice}" aria-pressed="${String(choice) === String(value)}">${text}</button>`).join('')}</div>
  </details></div>`;
}

function pickerForHair() {
  return picker('hair', t('hair'), avatar.hair_style ?? avatar.hair,
    hairStyles[avatar.gender][locale].map((label, index) => [index, label]));
}

function avatarFields() {
  const genders = ['unspecified', 'female', 'male'].map(value => [value, t(value)]);
  return `${picker('gender', t('gender'), avatar.gender, genders)}${pickerForHair()}
    ${[['hair_color', 'hairColor'], ['skin_tone', 'skinTone'], ['beard', 'beard'], ['outfit', 'outfit']]
      .map(([key, label]) => picker(key, t(label), (key === 'outfit' ? avatar.outfit_style : undefined) ?? avatar[key],
        avatarOptions[key][locale].map((name, index) => [index, name]))).join('')}
    ${picker('color', t('color'), avatar.color, ['cinnamon', 'sage', 'midnight', 'coffee'].map((key, index) => [palette[index], t(key)]))}`;
}

function avatarPresetPicker() {
  return `<fieldset class="avatar-presets"><legend>${t('characterPresets')}</legend><div>${avatarPresets.map(preset =>
    `<button type="button" data-avatar-preset="${preset.id}">${sprite(preset.look)}<span>${preset[locale]}</span></button>`).join('')}</div></fieldset>`;
}

function sprite(part, small = false) {
  return `<img alt="" class="sprite ${small ? 'small' : ''}" src="${portrait(part, small ? 'seated' : 'standing')}">`;
}

function deskItems(equipped, pet) {
  const equipment = deskEquipment(equipped);
  const animal = equipment.pet && petAppearance(equipment.pet, pet);
  const hasProps = equipment.props.some(Boolean);
  if (!animal && !hasProps) return '';
  return `<div class="desk-equipment" aria-hidden="true">
    ${hasProps ? `<div class="desk-tray">${equipment.props.map((item, slot) => `<div class="desk-cell">${item ?
      `<span class="desk-prop desk-${item}${slot === 0 ? ' desk-light' : ''}">${deskPropImage(item)}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${animal ? `<div class="pet-path"><span class="desk-pet pet-${equipment.pet}${animal.rests ? ' pet-rest' : ''}">
      <img src="${propImage(animal.art)}" alt=""></span></div>` : ''}
  </div>`;
}

function deskPropImage(item) {
  if (item === 'plant') return `<img src="${propImage('leaves')}" class="plant-leaves" alt=""><img src="${propImage('pot')}" alt="">`;
  if (item === 'jellyTank') return `<img src="${propImage('jellyTankBase')}" alt=""><img src="${propImage('jellyTankDrift')}" class="jelly-drift" alt="">`;
  return `<img src="${propImage(item)}" alt="">`;
}

function coffeeOnDesk(cup) {
  if (!cup || cup.expiresAt <= now()) return '';
  const arriving = !seenCups.has(cup.id);
  seenCups.add(cup.id);
  if (seenCups.size > 96) seenCups.delete(seenCups.values().next().value);
  return `<span aria-hidden="true" class="desk-coffee${arriving ? ' coffee-arrival' : ''}" data-coffee-until="${cup.expiresAt}">
    <i></i><i></i><img src="${propImage('coffeeGift')}" alt=""></span>`;
}

function refreshDeskDialog() {
  const member = data.members.find(entry => entry.desk_ref === selectedDesk?.desk_ref && !entry.own);
  if (!member) { reactionDialog.close(); return; }
  selectedDesk = member;
  const room = data.rooms.find(entry => entry.id === data.profile?.room);
  const accepts = member.acceptsInteractions !== false;
  reactionDialog.querySelector('h2').textContent = member.name;
  const friend = reactionDialog.querySelector('[data-action="addDeskFriend"]');
  friend.hidden = !room || !!room.private || Boolean(member.friendStatus);
  for (const reaction of reactionDialog.querySelectorAll('[data-action="react"]')) {
    reaction.disabled = !accepts || (reaction.dataset.value === 'coffee' && data.profile.coins < 1);
  }
  const status = reactionDialog.querySelector('[data-desk-state]');
  const friendStates = { accepted: 'friendsWithPeer', sent: 'friendSent', incoming: 'friendIncoming' };
  const label = !accepts ? 'interactionUnavailable' : friendStates[member.friendStatus];
  status.hidden = !label;
  status.textContent = label ? t(label) : '';
}

function seat(member, index, [column, row]) {
  const activity = member?.activity ?? member?.status;
  const atDesk = activity === 'desk' || activity === 'working';
  const seated = atDesk || activity === 'missedCheck';
  const name = member ? escape(member.name) + (member.own ? ' · ' + t('you') : '') : t('empty') + ' ' + (index + 1);
  const canReact = member?.desk_ref && !member.own && !running();
  return `<div class="seat ${member?.own ? 'own' : member ? '' : 'empty'}${column === 2 ? ' center-column' : ''}" style="grid-column:${column};grid-row:${row}">
    ${member ? `<span class="seat-status ${activity}"><span class="dot"></span> ${t(activity === 'working' ? 'studyWorking' : activity)}</span>` : ''}
    <div class="chair"></div>
    ${member && seated ? sprite(dressedAvatar(member.avatar, member.placed), true) : ''}
    <div class="desktop" aria-hidden="true">
      ${coffeeOnDesk(member?.coffeeCup)}
      ${atDesk ? `<span class="desk-writing" style="--writing-frames:${writingSize.frames}"><img src="${writingFrames(member.avatar.skin_tone)}" alt=""></span>` : '<span class="book"></span>'}
    </div>
    ${member ? deskItems(member.placed, member.pet) : ''}
    <div class="seat-name">${name}</div>
    ${canReact ? `<button class="desk-select" type="button" data-action="select-desk" data-value="${escape(member.desk_ref)}"
      aria-label="${name} · ${t('deskReaction')}"></button>` : ''}
  </div>`;
}

function roomSeats(members) {
  const own = members.find(member => member.own);
  const others = members.filter(member => !member.own);
  const ring = [[1, 2], [3, 2], [2, 1], [2, 3], [1, 1], [3, 1], [1, 3], [3, 3]];
  return `<div class="seats">${seat(own, 4, [2, 2])}${ring.map((position, index) =>
    seat(others[index], (position[1] - 1) * 3 + position[0] - 1, position)).join('')}</div>`;
}

function roomView(room) {
  const preview = room ?? data.rooms[0];
  const name = preview ? escape(localName(preview)) : t('library');
  const paused = session() && !running();
  const duringBreak = onBreak();
  const durationOptions = Object.entries(breakPresets).map(([value, length]) =>
    [value, value + ' ' + t('focusAndBreak').replace('{break}', length)]);
  durationOptions.push(['custom', t('customDuration')]);
  const controls = duringBreak ? `<p>${t('breakInProgress')}</p>` : running()
    ? `<button class="primary" data-action="status" data-value="break">${t('pause')}</button>`
    : paused && room
      ? `<button class="primary" data-action="status" data-value="desk">▶ &nbsp; ${t('resume')}</button><button class="secondary" data-action="abandon">${t('abandon')}</button>`
      : room
        ? `<div class="status-group"><button data-action="status" data-value="desk" aria-pressed="${data.profile.status === 'desk'}">▣ ${t('desk')}</button><button data-action="status" data-value="break" aria-pressed="${data.profile.status === 'break'}">☕ ${t('break')}</button></div>
        <div class="period-settings">${picker('duration', t('periodDuration'), durationChoice, durationOptions)}
        ${durationChoice === 'custom' ? `<label class="field custom-duration">${t('minutes')} <input id="custom-duration" type="number" inputmode="numeric" min="5" max="180" step="1" value="${escape(customDuration)}"><small>${t('duration')}</small></label>
          <label class="field custom-duration">${t('breakDuration')} <input id="custom-break" type="number" inputmode="numeric" min="1" max="60" step="1" value="${escape(customBreak)}"><small>${t('breakDurationHelp')}</small></label>` : ''}
        </div>
        ${data.todayPlans?.length ? `<label class="field planner-select">${t('plannerChoose')}
          <select id="focus-plan"><option value="">${t('plannerUnlinked')}</option>${data.todayPlans.map(plan =>
            `<option value="${escape(plan.id)}" ${plan.id === chosenPlan ? 'selected' : ''}>${escape(plan.topic)}</option>`).join('')}</select></label>` : ''}
        <button class="primary" data-action="start" ${validDuration() ? '' : 'disabled'}>▶ &nbsp; ${t('start')}</button>`
        : `<a class="primary" href="#rooms">${t('joinRoom')}</a>`;
  const progress = roomProgressMinutes(data.roomGoal, now());
  const theme = roomPreferences.themeFor(room);
  const hasFriends = data.friends?.some(friend => friend.status === 'accepted');
  return `<div class="room-layout">
    <div class="heading compact-heading room-heading"><div class="room-identity"><h1 id="room-title">${name}</h1>
      ${room?.private ? `<span class="private-badge">${t('privateBadge')}</span>` : ''}
      ${room?.expiresAt ? `<small class="room-expiry">${t('privateRoomEndsAt')} · <time datetime="${new Date(room.expiresAt).toISOString()}">${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(room.expiresAt)}</time></small>` : ''}</div>
      ${room && hasFriends && !running() ? `<button class="secondary invite-friends" data-action="invite-dialog"
        aria-label="${t('friendInvite')}" title="${t('friendInvite')}"><span aria-hidden="true">♙+</span><b>${t('friendInvite')}</b></button>` : ''}
    </div>
    ${room ? `<div class="room-goal"><span>🎁 ${t('chestGoal')}</span>
      <progress aria-label="${t('groupMinutes')}" max="${roomGoalMinutes}" value="${progress}"></progress>
      <b>${progress}/${roomGoalMinutes}</b><small class="room-goal-odds">${t('chestGoalInfo')}</small></div>` : ''}
    <div class="room-stage">
      <section class="scene" data-room-theme="${theme}" style="--room-art:url('${roomBackdrop(theme)}')" aria-labelledby="room-title">
        <div class="scene-top"><span><span class="dot"></span> <span id="room-count">${room?.count ?? 0}</span> / ${room?.capacity ?? 9} ${t('people')}</span><span>☾ &nbsp; ${t('quietRoom')}</span></div>
        <div id="room-seats"></div>
      </section>
    </div>
    <div class="room-panel">
      <section class="controls" aria-labelledby="focus-title">
        <div class="timer"><div class="timer-ring" id="timer-ring"><b id="timer">50:00</b></div>
          <div class="timer-copy"><h2 id="focus-title">${t(duringBreak ? 'autoBreak' : 'focus')}</h2><p>${duringBreak ? '' : t(running() ? 'focusing' : paused ? 'paused' : 'every20')}</p></div>
        </div>
        <div class="control-actions">${controls}${room && !running() ? `<button class="secondary" data-action="leave">${t('leave')}</button>` : ''}</div>
      </section>
      ${room ? quietModeToggle() : ''}
      ${room && !running() ? `<section class="room-settings" aria-labelledby="room-settings-title">
        <h2 id="room-settings-title">${t('roomSettings')}</h2>
        ${roomPreferences.markup(room, data.inventory)}
        ${room.owned ? `<div class="room-visibility">
          <span class="private-badge">${t(room.private ? 'roomMadePrivate' : 'roomMadePublic')}</span>
          <button type="button" class="secondary" data-action="room-visibility">${t(room.private ? 'roomMakePublic' : 'roomMakePrivate')}</button>
        </div>` : ''}
        ${room.invite ? `<p class="room-meta">${t('inviteCode')} <b>${escape(room.invite)}</b></p>` : ''}
      </section>` : ''}
    </div>
  </div>`;
}

function roomTool(id, title, contents) {
  return `<details class="card room-tool" data-disclosure="${id}" ${expandedPanels.has(id) ? 'open' : ''}>
    <summary class="disclosure-summary"><span>${title}</span><small></small></summary>${contents}</details>`;
}

function roomsView() {
  return `<div class="heading compact-heading"><h1>${t('rooms')}</h1><div class="together-actions"><a class="primary" href="#together">${t('together')}</a><a class="secondary" href="#ranking">${t('leaderboard')}</a></div></div>
  <div class="room-tools">
    <label class="room-search"><span aria-hidden="true">⌕</span>
      <input type="search" id="room-search" placeholder="${t('searchTarget')}" aria-label="${t('searchTarget')}" value="${escape(roomSearch)}"></label>
    ${roomTool('private-rooms', t('privateRooms'), `<div class="private-room-forms">
      <section>
        <h3>${t('openPrivateRoom')}</h3>
        ${data.profile.ownsPrivateRoom ? `<p class="room-owned" role="status">${t('privateRoomOwned')}</p>`
          : `<form class="stacked" id="create-room-form"><label class="field">${t('roomName')}
            <input name="roomName" value="${escape(draft.roomName)}" required minlength="2" maxlength="32"></label>
            <p class="room-expiry-help">${t('privateRoomExpiryHelp')}</p>
            <button class="primary">${t('createRoom')}</button></form>`}
      </section>
      <section>
        <h3>${t('joinCode')}</h3>
        <form class="stacked" id="join-room-form">
          <label class="field">${t('inviteCode')} <input name="invite" value="${escape(draft.invite)}" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6"></label>
          <button class="secondary">${t('joinCode')}</button>
        </form>
      </section>
    </div>`)}
  </div>
  ${studyInvitations(data, t, escape, locale)}
  <div class="room-grid room-list">${data.rooms.map(room => `<article class="card room-card" data-room-id="${escape(room.id)}">
    <div class="room-preview"><img src="${roomBackdrop(defaultRoomTheme(room.id, (room.minutes ?? 0) >= roomThemeUnlockMinutes))}" alt="" width="384" height="128" loading="lazy"></div>
    <div class="room-card-title"><h2>${escape(localName(room))}</h2>${room.private ? `<span class="private-badge">${t('privateBadge')}</span>` : ''}</div>
    <p><span class="dot"></span> ${room.count} / ${room.capacity} ${t('people')}</p>
    <button class="primary" data-action="join" data-value="${escape(room.id)}" ${room.count >= room.capacity && data.profile?.room !== room.id ? 'disabled' : ''}>${t(data.profile?.room === room.id ? 'open' : room.count >= room.capacity ? 'roomFull' : 'joinRoom')}</button>
  </article>`).join('')}</div>
  <p id="room-search-empty" role="status" hidden>${t('noRooms')}</p>`;
}

function filterRooms() {
  const normalize = name => name.normalize('NFC').toLocaleLowerCase(locale);
  const term = normalize(roomSearch.trim());
  const matches = new Set(data.rooms.filter(room =>
    [room.name, room.name_en].some(value => value && normalize(value).includes(term)))
    .map(room => room.id));
  for (const card of content.querySelectorAll('.room-card')) card.hidden = !matches.has(card.dataset.roomId);
  document.querySelector('#room-search-empty').hidden = matches.size > 0;
}

function itemImage(item) {
  if (item.kind === 'wearable' || item.kind === 'hair') return sprite(dressedAvatar(data.profile.avatar, [item.id]));
  if (item.id === 'plant') return `<span class="catalog-plant"><img src="${propImage('leaves')}" alt=""><img src="${propImage('pot')}" alt=""></span>`;
  return hasPropArt(item.id) ? `<img src="${propImage(item.id)}" alt="">` : '✦';
}

function itemCards(items, inventoryOnly) {
  return `<div class="cards">${items.map(item => {
    const owned = data.inventory.find(entry => entry.item === item.id);
    const rare = !canBuyFromShop(item);
    const label = item.kind === 'hair' || item.kind === 'wearable' ? 'catalogWear' : 'use';
    return `<article class="card ${rare ? 'rare-card' : ''}"><span class="item-icon item-preview">${itemImage(item)}</span>
      <h2>${escape(localName(item))}</h2>${rare ? `<p>${t('chestReward')}</p>` : ''}
      ${inventoryOnly ? item.kind === 'ambience' ? `<p>${t('catalogSound')}</p>` :
        `<button class="secondary" data-action="place" data-value="${escape(item.id)}">${t(owned.placed ? 'useRemove' : label)}</button>`
        : rare ? '' : `<button class="primary" data-action="buy" data-value="${escape(item.id)}"
        ${owned || data.profile.coins < item.price ? 'disabled' : ''}>${owned ? t('owned') : '◉ ' + item.price + ' ' + t('coins')}</button>`}
    </article>`;
  }).join('')}</div>`;
}

function boxCards() {
  const boxes = data.boxes ?? [];
  if (!boxes.length) return '';
  const owned = new Set(data.inventory.map(entry => entry.item));
  const items = new Map(data.items.map(item => [item.id, item]));
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
  return `<section class="box-offers">
    <h2 class="section-title">${t('catalogChests')}</h2><p>${t('boxRules')}</p>
    <div class="box-grid">${boxes.map(box => {
      const odds = boxOdds(box.rewards, owned);
      const available = odds.some(reward => reward.chance > 0);
      const art = boxArt[box.id];
      const panel = 'box-' + box.id;
      const label = t(boxLabels[box.id]);
      return `<article class="card mystery-box box-${escape(box.id)}">
        <span class="item-icon item-preview"><img src="${propImage(art)}" alt=""></span>
        <h3>${label}</h3>
        <details class="box-disclosure" data-disclosure="${panel}" ${expandedPanels.has(panel) ? 'open' : ''}>
          <summary class="disclosure-summary"><span>${t('boxOdds')}</span><small>${odds.length} ${t('prizeOptions')}</small></summary>
          <ul class="box-odds" aria-label="${t('boxOdds')}">${odds.map(reward => {
            const item = items.get(reward.item);
            const name = item ? localName(item) : reward.item;
            const art = item ? itemImage(item) : '';
            return `<li><span class="box-odds-thumb" aria-hidden="true">${art}</span><span>${escape(name)}</span>
              <b>${reward.chance ? percent.format(reward.chance) : t('owned')}</b></li>`;
          }).join('')}</ul>
        </details>
        <button class="primary" data-action="openBox" data-value="${escape(box.id)}" data-price="${box.price}" aria-label="${label} · ${box.price} ${t('boxOpen')}"
          ${!available || data.profile.coins < box.price ? 'disabled' : ''}>${available ? '◉ ' + box.price + ' ' + t('boxOpen') : t('collectionComplete')}</button>
      </article>`;
    }).join('')}</div>
  </section>`;
}

function catalog(inventoryOnly) {
  const scope = inventoryOnly ? 'inventory' : 'shop';
  const activeCategory = catalogCategory[scope];
  const choices = data.items.filter(item => inventoryOnly ? data.inventory.some(entry => entry.item === item.id) : canBuyFromShop(item));
  const visible = activeCategory === 'all' ? choices : choices.filter(item => item.kind === activeCategory);
  const boxes = !inventoryOnly && (activeCategory === 'all' || activeCategory === 'rare') ? boxCards() : '';
  return `<div class="catalog-filter">${picker(scope, t('catalogFilter'), activeCategory,
    Object.entries(categories).map(([value, label]) => [value, t(label)]))}</div>
    ${!visible.length && !boxes ? `<p class="empty-message">${t(inventoryOnly && !choices.length ? 'emptyInventory' : 'catalogEmpty')}</p>` : ''}
    ${boxes}
    ${visible.length ? itemCards(visible, inventoryOnly) : ''}`;
}

function profileCode(label, code, shareable = true) {
  const title = t(label);
  if (shareable) code = splitProfileCode(code).suffix;
  return `<div><dt>${title}</dt><dd><code>${escape(code)}</code>
    <div class="profile-code-actions">
      <button class="secondary" data-action="copy-profile-code" data-value="${escape(code)}" aria-label="${t('copyCode')} · ${title}">${t('copyCode')}</button>
      ${shareable ? `<button class="secondary" data-action="share-profile-code" data-value="${escape(code)}"
        data-label="${title}" aria-label="${t('shareCode')} · ${title}">${t('shareCode')}</button>` : ''}
    </div>
  </dd></div>`;
}

function profileView() {
  const profile = data.profile;
  const name = escape(profile?.name);
  const readerCode = profile?.shortReaderCode || profile?.readerCode;
  const referralCode = profile?.shortReferralCode || profile?.referralCode;
  return `<div class="heading${profile ? ' profile-heading' : ''}"><h1>${t(profile ? 'profileInventory' : 'newAvatar')}</h1>
    ${profile ? `<div class="profile-shortcuts">
      <button class="secondary" data-action="study-card">${t('studyCardAction')}</button>
      <a class="secondary" href="#ranking">${t('leaderboard')}</a>
    </div>` : ''}
  </div>
  <section class="profile-card${profile && !editing ? ' profile-overview' : ''}">${sprite(editing || !profile ? avatar : dressedAvatar(profile.avatar, placed()))}
  ${editing || !profile ? `<form id="avatar-form"><label>${t('name')}<input name="name" value="${escape(draft.avatarName ?? profile?.name)}" minlength="2" maxlength="24" required></label>
  ${!profile ? `<div class="field"><label for="registration-code">${t('referralField')}</label>
    <div class="code-field"><button type="button" class="secondary" data-referral-prefix aria-label="${t('switchCodePrefix')} · ${referralPrefix}-">${referralPrefix}-</button>
    <input id="registration-code" name="referral" value="${escape(draft.referral)}" maxlength="15" autocapitalize="characters" autocomplete="off"></div></div>` : ''}
  ${avatarPresetPicker()}<div class="form-options">${avatarFields()}</div><button class="primary">${t('saveAvatar')}</button></form>` : `<div class="profile-details"><h2>${name}</h2>
    <dl class="profile-codes">
      ${readerCode ? profileCode('readerCode', readerCode) : profileCode('accountId', userId, false)}
      ${referralCode ? profileCode('referralCode', referralCode) : ''}
    </dl>
    <div class="profile-hero-actions">${quietModeToggle()}<button class="secondary" data-action="edit">${t('editAvatar')}</button>
    ${profile.room ? `<button class="secondary" data-action="leave">${t('leave')}</button>` : ''}</div></div>`}</section>
  ${profile ? `${roomTool('planner', t('plannerDisclosure'), `<a class="secondary" href="#together">${t('meetings')}</a><div data-study-planner></div>`)}
    <section class="card study-totals" aria-label="${t('studyTotals')}">
      <div><small>${t('focusToday')}</small><b>${data.dailyQuests?.minutes ?? 0} ${t('minuteUnit')}</b></div>
      <div><small>${t('focusWeek')}</small><b>${data.weeklyQuests?.goals.find(goal => goal.unit === 'minutes')?.progress ?? 0} ${t('minuteUnit')}</b></div>
    </section>
    ${focusQuests(data.dailyQuests, data.weeklyQuests, t, expandedPanels)}
    ${friendsPanel(data, draft.friendCode, t, escape, expandedPanels.has('friends'), locale)}
    <h2 class="section-title">${t('inventory')}</h2><p class="equipment-note">${t('equipmentLimit')}</p>${catalog(true)}` : ''}
  <section class="card account-section" aria-labelledby="account-title">
    <h2 id="account-title">${t('myAccount')}</h2>
    <div class="account-actions">
      <a class="secondary account-button account-data" href="${privacyHref()}">${t('myData')}</a>
      <button class="secondary account-button account-sign-out" data-action="sign-out">${t('signOut')}</button>
      ${termsButton()}
      <button class="secondary account-button" data-action="open-tour">${t('tourOpen')}</button>
      ${metrics.control(t('webMeasurement'))}
      <a class="secondary account-button account-danger" href="${deletionHref()}">${t('deleteAccount')}</a>
    </div>
  </section>`;
}

function shopView() {
  return `<div class="heading compact-heading shop-heading"><h1>${t('shop')}</h1>
    <button class="secondary" data-action="coin-help">${t('coinHelp')}</button></div>
  <div class="toolbar reward-toolbar"><button class="primary" data-action="reward-ad" ${openingAd ? 'disabled' : ''}>${t(openingAd ? 'adLoading' : 'watchAd')}</button>
    <button class="secondary" data-action="openChest" ${!data.chests ? 'disabled' : ''}>${t('chest')} · ${data.chests ?? 0}</button>
    <small id="ad-cooldown" role="status"></small></div>
  ${focusQuests(data.dailyQuests, data.weeklyQuests, t, expandedPanels)}${catalog(false)}`;
}

function rankingView() {
  const header = `<div class="heading"><h1>${t('leaderboard')}</h1></div>`;
  if (!ranking) return header + `<p>${t('loading')}</p>`;
  if (ranking.error) return `${header}<p>${messageFor(ranking.error, t)}</p><button class="secondary" data-action="ranking-retry">${t('retry')}</button>`;
  return `${header}<section class="card">
    <p>${escape(ranking.starts)} – ${escape(ranking.ends)} · ${t('istanbulTime')}</p>
    <p>${t('rankingInfo')}</p><p class="ranking-prizes">${t('rankingPrizes')}</p>
    <button class="secondary" data-action="rankingVisibility" data-value="${!ranking.visible}">${t(ranking.visible ? 'rankingLeave' : 'rankingJoin')}</button>
    ${ranking.own ? `<p>${t('rankingPosition')} <b>${ranking.own.rank}</b> · ${ranking.own.minutes} ${t('minuteUnit')}</p>` : ''}
    ${ranking.rows.length ? `<ol class="ranking-list">${ranking.rows.map(row => `<li><span>${row.rank} · ${escape(row.name)}</span><b>${row.minutes} ${t('minuteUnit')}</b></li>`).join('')}</ol>`
      : `<p>${t('rankingEmpty')}</p>`}
  </section>`;
}

function loadRanking() {
  if (rankingRequest) return rankingRequest;
  const id = userId;
  rankingRequest = invokeLibrary(client, 'leaderboard').then(
    result => { if (id === userId) ranking = result; },
    error => { if (id === userId) ranking = { error: error.message || 'server' }; },
  ).finally(() => {
    if (id === userId) { rankingRequest = null; render(); }
  });
  return rankingRequest;
}

function mountPlannerHost(host) {
  if (!host || planner || host.dataset.loading === 'true') return;
  host.dataset.loading = 'true';
  const language = locale;
  void import('./web-planner.js').then(({ mountPlanner }) => {
    if (!host.isConnected || language !== locale) return;
    plannerLocale = language;
    planner = mountPlanner(host, { t, locale, escape,
      request: payload => invokeLibrary(client, 'studyPlanner', payload),
      confirm: (...args) => accountDialogs.confirm(...args),
      saved: () => { toast(t('plannerReady')); refreshState(); },
    });
  }).catch(() => {
    if (host.isConnected) host.textContent = t('server');
    delete host.dataset.loading;
  });
}

function paint(signature, html) {
  if (signature === lastView) return;
  renderedDemo?.();
  renderedDemo = undefined;
  renderedTogether?.();
  renderedTogether = undefined;
  const active = document.activeElement;
  let restore;
  if (active instanceof HTMLInputElement && content.contains(active)) {
    const selector = active.id ? '#' + CSS.escape(active.id) : active.form?.id && `#${CSS.escape(active.form.id)} [name="${CSS.escape(active.name)}"]`;
    if (selector) restore = { selector, start: active.selectionStart, end: active.selectionEnd };
  }
  renderedGames?.();
  renderedGames = undefined;
  const plannerHost = content.querySelector('[data-study-planner]');
  content.innerHTML = html();
  const nextPlannerHost = content.querySelector('[data-study-planner]');
  if (plannerHost && nextPlannerHost && planner && plannerLocale === locale) nextPlannerHost.replaceWith(plannerHost);
  else {
    planner?.close();
    planner = undefined;
    if (nextPlannerHost?.closest('details')?.open) mountPlannerHost(nextPlannerHost);
  }
  if (restore) {
    const input = content.querySelector(restore.selector);
    input?.focus({ preventScroll: true });
    if (input && restore.start !== null) input.setSelectionRange(restore.start, restore.end);
  }
  lastView = signature;
  lastScene = undefined;
}

function finishPageTransition() {
  pageTransition++;
  pageLoader.hidden = true;
  content.inert = false;
  content.removeAttribute('aria-busy');
}

function loadPage(view, room) {
  if (currentView === view) return;
  const previous = currentView;
  currentView = view;
  if (!previous) return;
  if (previous === 'profile') {
    expandedPanels.delete('planner');
    expandedPanels.delete('friends');
  }

  const images = ['/app-mark.webp'];
  if (view === 'room') images.push(roomBackdrop(roomPreferences.themeFor(room)));
  if (view === 'profile') images.push('/library.webp');
  if (view === 'rooms') images.push(...data.rooms.slice(0, 4).map(entry => roomBackdrop(defaultRoomTheme(entry.id))));
  const preparation = images.map(preloadImage);
  if (view === 'games') preparation.push(import('./web-games.js').then(({ gameBackdropUrls, loadGameStyles }) =>
    Promise.allSettled([...gameBackdropUrls.map(preloadImage), loadGameStyles()])));
  if (view === 'ranking' && !ranking) preparation.push(loadRanking());
  if (running()) {
    finishPageTransition();
    return;
  }
  const transition = ++pageTransition;
  pageLoader.innerHTML = loadingScreen();
  pageLoader.hidden = false;
  content.inert = true;
  content.setAttribute('aria-busy', 'true');
  window.scrollTo({ top: 0, behavior: 'instant' });
  void waitForPage(preparation).then(() => {
    if (transition === pageTransition) finishPageTransition();
  });
}

function loadTogether(id, signedIn) {
  const host = content.querySelector('[data-study-together]');
  if (!host || renderedTogether || host.dataset.loading === 'true') return;
  host.dataset.loading = 'true';
  void import('./web-together.js').then(({ mountTogether }) => {
    if (!host.isConnected) return;
    renderedTogether = mountTogether(host, { id, signedIn, t, locale, escape,
      invoke: (action, payload) => invokeLibrary(client, action, payload),
      join: async meet => {
        if (await request('joinStudyMeet', { id: meet.id })) {
          durationChoice = 'custom';
          customDuration = String(meet.minutes);
          location.hash = 'room';
        }
      },
      share: (text) => shareText(t('meetTitle'), text),
      confirm: (...args) => accountDialogs.confirm(...args),
      changed: () => { planner?.refresh(); refreshState(); },
      card: goal => void openStudyCard(goal),
    });
  }).catch(() => { if (host.isConnected) host.textContent = t('server'); });
}

async function openStudyCard(partner) {
  if (!data?.profile) return;
  const actor = userId;
  const profile = { ...data.profile, avatar: dressedAvatar(data.profile.avatar, placed()) };
  try {
    const summary = partner ? null : await invokeLibrary(client, 'studySummary');
    if (actor !== userId || running()) return;
    cardModel = { summary, partner, profile, mode: 'daily', name: true, minutes: true, streak: true, topics: false };
    const controls = cardDialog.querySelector('[data-card-options]');
    cardDialog.querySelector('img').alt = t(partner ? 'pairShare' : 'studyCard');
    cardDialog.querySelector('h2').textContent = t(partner ? 'pairShare' : 'studyCard');
    controls.innerHTML = partner ? '' : `<label>${t('studyCardAction')} <select name="mode">
      <option value="daily">${t('cardDaily')}</option><option value="weekly" ${summary.week ? '' : 'disabled'}>${t('cardWeekly')}</option>
      </select></label><div class="together-actions">${Object.entries({ name:'cardName',minutes:'cardMinutes',streak:'cardStreak',topics:'cardTopics' })
      .map(([key,label]) => `<label class="together-check" data-card-field="${key}"><input type="checkbox" name="${key}" ${cardModel[key] ? 'checked' : ''}> ${t(label)}</label>`).join('')}</div>`;
    if (!cardDialog.open) cardDialog.showModal();
    await renderStudyCard();
  } catch { toast(t('downloadFailed')); }
}

async function renderStudyCard() {
  if (!cardModel) return;
  const generation = ++cardGeneration;
  const { summary, profile, ...options } = cardModel;
  cardDialog.querySelectorAll('[data-card-field]').forEach(field => {
    field.hidden = field.dataset.cardField === 'topics' ? options.mode !== 'weekly' : field.dataset.cardField === 'streak' && options.mode === 'weekly';
  });
  cardDialog.querySelector('img').removeAttribute('src');
  cardDialog.querySelector('[data-card-download]').replaceChildren();
  cardFile = undefined;
  try {
    const preview = await createStudyCardPreview(summary, profile, locale, options);
    if (generation !== cardGeneration || !cardDialog.open) return;
    if (cardUrl) URL.revokeObjectURL(cardUrl);
    cardUrl = URL.createObjectURL(preview.blob);
    cardFile = new File([preview.blob], preview.filename, { type: 'image/png' });
    cardDialog.querySelector('img').src = cardUrl;
    const footer = cardDialog.querySelector('[data-card-download]');
    const download = Object.assign(document.createElement('a'), {
      className: 'primary', href: cardUrl, download: preview.filename, textContent: t('downloadCard'),
    });
    footer.replaceChildren(download);
    if (navigator.canShare?.({ files: [cardFile] })) {
      const share = Object.assign(document.createElement('button'), { className: 'secondary', textContent: t('cardShare') });
      share.onclick = () => { if (cardFile) void navigator.share({ files: [cardFile] }).catch(() => {}); };
      footer.append(share);
    }
  } catch { if (generation === cardGeneration) toast(t('downloadFailed')); }
}

cardDialog.addEventListener('change', event => {
  const field = event.target;
  if (!cardModel || !['mode', 'name', 'minutes', 'streak', 'topics'].includes(field.name)) return;
  cardModel[field.name] = field.name === 'mode' ? field.value : field.checked;
  void renderStudyCard();
});

function render() {
  if (!authReady) { paint('auth-loading', loadingScreen); return; }
  const meet = meetingId();
  try {
    if (meet) sessionStorage.setItem('vsc-meet-pending', meet);
    else sessionStorage.removeItem('vsc-meet-pending');
  } catch {}
  const page = meet ? 'meet' : location.hash.slice(1);
  const lock = running();
  const sidebar = document.querySelector('.sidebar');
  sidebar.inert = lock || !userId || deletionPage;
  languageToggle.disabled = lock;
  document.body.classList.toggle('focusing', lock);
  if (lock && !pageLoader.hidden) finishPageTransition();
  document.querySelector('#balance').textContent = data?.profile?.coins ?? 0;
  const unread = data?.profile?.doNotDisturb ? 0 : (data?.friends?.filter(friend => friend.status === 'incoming').length ?? 0) + (data?.studyInvites?.length ?? 0);
  const notification = document.querySelector('#social-unread');
  notification.hidden = !unread;
  notification.textContent = unread || '';
  if (!userId && client && !deletionPage && page === 'demo') {
    currentView = 'demo';
    updatePageMetadata('demo');
    document.querySelector('#location').textContent = t('demoTitle');
    paint('demo:' + locale, () => '<div id="demo-view"></div>');
    const host = content.querySelector('#demo-view');
    if (!renderedDemo && host && host.dataset.loading !== 'true') {
      host.dataset.loading = 'true';
      void import('./web-demo.js').then(({ mountDemo }) => {
        if (!host.isConnected) return;
        renderedDemo = mountDemo(host, { t, locale, getAccess: () => demoAccess, saveAccess: saveDemoAccess,
          invoke: (action, payload) => invokeLibrary(client, action, payload),
          showTour: () => showTour(0, 'preview'),
          register: () => { demoLogin = true; location.hash = 'sign-in'; },
        });
      }).catch(() => { if (host.isConnected) host.textContent = t('server'); });
    }
    return;
  }
  if (lock || !userId) {
    if (inviteDialog.open) inviteDialog.close();
    if (coinHelp.open) coinHelp.close();
    if (shareCodeDialog.open) shareCodeDialog.close();
  }
  if (!userId || deletionPage || !data) {
    currentView = undefined;
    if (!pageLoader.hidden) finishPageTransition();
    roomPreferences.sync(null);
    if (verification.open) verification.close();
    const signIn = !userId;
    updatePageMetadata(deletionPage ? 'deletion' : 'home');
    document.querySelector('#location').textContent = t(signIn ? 'signIn' : deletionPage ? 'deletionPage' : 'library');
    paint(JSON.stringify([signIn, deletionPage, emailSentTo, emailFeedback, Boolean(data), locale, demoLogin, meet]),
      signIn ? signInView : deletionPage ? deletionView : loadingScreen);
    if (meet && signIn && client) loadTogether(meet, false);
    updateEmailResend();
    return;
  }
  const inRoom = !expiredLocally && Boolean(data.profile?.room);
  const roomLocked = lock || (page === 'rooms' && inRoom && !onBreak());
  const view = !data.profile ? 'profile' : roomLocked ? 'room' : Object.hasOwn(labels, page) ? page : 'rooms';
  if (roomLocked && page !== 'room') history.replaceState(null, '', '#room');
  document.querySelector('#location').textContent = t(labels[view]);
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if ((view !== 'room' || lock) && reactionDialog.open) reactionDialog.close();
  const room = inRoom ? data.rooms.find(item => item.id === data.profile?.room) : undefined;
  updatePageMetadata(view);
  loadPage(view, room);
  if (view === 'meet' || view === 'together') {
    roomPreferences.sync(null);
    paint(JSON.stringify([view, locale, meet]), () => '<div data-study-together></div>');
    loadTogether(view === 'meet' ? meet : null, true);
    updateClock();
    return;
  }
  const signature = JSON.stringify([view, view === 'room'
    ? [room?.id, onBreak(), room?.minutes, room?.invite, room?.private, room?.owned, room?.expiresAt, data.profile?.status, data.session, durationChoice, data.inventory, data.todayPlans,
      data.friends?.some(friend => friend.status === 'accepted'), data.profile?.doNotDisturb]
    : view === 'rooms' ? [data.rooms, data.studyInvites, data.profile.ownsPrivateRoom] : view === 'ranking' ? ranking : view === 'games' ? null
      : [data.profile, data.inventory, data.items, data.dailyQuests, data.weeklyQuests, data.boxes,
        view === 'shop' ? [data.chests, data.adPlatforms?.web, openingAd] : [data.friends, data.studyInvites]], editing, locale,
  catalogCategory[view === 'profile' ? 'inventory' : view]]);
  paint(signature, () => view === 'room' ? roomView(room) : view === 'rooms' ? roomsView()
    : view === 'profile' ? profileView() : view === 'ranking' ? rankingView()
      : view === 'games' ? `<section id="games-view"><div class="heading"><h1>${t('games')}</h1></div></section>` : shopView());
  const gameHost = view === 'games' && content.querySelector('#games-view');
  if (gameHost && !renderedGames && gameHost.dataset.loading !== 'true') {
    gameHost.dataset.loading = 'true';
    void import('./web-games.js').then(async ({ mountGames, loadGameStyles }) => {
      await loadGameStyles();
      if (gameHost.isConnected) renderedGames = mountGames(gameHost, locale);
    }).catch(() => { if (gameHost.isConnected) gameHost.append(t('server')); });
  }
  roomPreferences.sync(view === 'room' ? room : null, data.inventory);
  if (view === 'rooms') filterRooms();
  if (data.profile?.tourPending && !tourDialog.open && !lock) showTour(tourIndex);
  if (view === 'ranking' && !ranking) void loadRanking();
  if (view === 'room') {
    const count = room?.count ?? 0;
    const members = displayDeskStatuses(data.members, data.now, deskUpdates);
    const sceneSignature = JSON.stringify([count, members]);
    if (lastScene !== sceneSignature) {
      document.querySelector('#room-count').textContent = count;
      document.querySelector('#room-seats').innerHTML = roomSeats(members);
      lastScene = sceneSignature;
    }
  }
  if (inviteDialog.open && view !== 'room') inviteDialog.close();
  if (inviteDialog.open) renderInviteOptions();
  if (reactionDialog.open) refreshDeskDialog();
  updateClock();
}

function renderInviteOptions() {
  const friends = (data.friends ?? []).filter(friend => friend.status === 'accepted');
  const signature = JSON.stringify([friends, locale]);
  if (signature === lastInviteOptions) return;
  lastInviteOptions = signature;
  inviteDialog.querySelector('.study-invite-options').innerHTML = friends.map(friend => studyInviteButton(friend, t, escape, friend.name)).join('');
}

const format = seconds => [Math.floor(seconds / 60), seconds % 60].map(part => String(part).padStart(2, '0')).join(':');

function updateEmailResend() {
  const button = document.querySelector('#resend-email');
  if (!button) return;
  const seconds = Math.max(0, Math.ceil((emailRetryAt - Date.now()) / 1000));
  button.disabled = busy || seconds > 0;
  const label = seconds ? `${t('resend')} · ${seconds} ${t('secondsShort')}` : t('resend');
  if (button.textContent !== label) button.textContent = label;
}

function updateClock() {
  updateEmailResend();
  const active = session();
  const observed = now();
  for (const cup of content.querySelectorAll('[data-coffee-until]')) {
    if (Number(cup.dataset.coffeeUntil) <= observed) cup.remove();
  }
  const autoBreak = data?.autoBreak;
  if (autoBreak && data.profile?.room && autoBreak.endsAt <= observed && returnedBreak !== autoBreak.id) {
    returnedBreak = autoBreak.id;
    if (cardDialog.open) cardDialog.close();
    if (coinHelp.open) coinHelp.close();
    if (shareCodeDialog.open) shareCodeDialog.close();
    location.hash = 'room';
    refreshState();
    queueMicrotask(render);
  }
  breakBanner.hidden = !onBreak();
  if (!breakBanner.hidden) {
    breakBanner.querySelector('span').textContent = `${t('autoBreak')} · ${format(Math.ceil((autoBreak.endsAt - observed) / 1000))}`;
  }
  const deadline = data?.session?.disconnectDeadline;
  const connectionLeft = deadline == null ? null : deadline - observed;
  const timedOut = disconnected && connectionLeft !== null && connectionLeft <= 0;
  if (timedOut && !expiredLocally) {
    expiredLocally = true;
    location.hash = 'rooms';
    queueMicrotask(render);
  }
  connectionBanner.hidden = !connectionExpired && !(disconnected && data?.profile?.room);
  if (!connectionBanner.hidden) {
    const label = connectionExpired || timedOut ? t('connectionExpired')
      : connectionLeft === null ? t('reconnecting')
        : `${t('networkUnavailable')} ${t('reconnectIn')} · ${format(Math.ceil(connectionLeft / 1000))}`;
    if (connectionBanner.textContent !== label) connectionBanner.textContent = label;
  }
  const progressBar = content.querySelector('.room-goal progress');
  if (progressBar) {
    const progress = roomProgressMinutes(data.roomGoal, observed);
    if (progressBar.value !== progress) {
      progressBar.value = progress;
      progressBar.nextElementSibling.textContent = `${progress}/${roomGoalMinutes}`;
    }
  }
  const remain = onBreak() ? autoBreak.endsAt - observed
    : timedOut ? 0 : active ? focusRemaining(active, pendingPauseAt ?? observed) : validDuration() ? duration() * 60000 : null;
  const timer = document.querySelector('#timer');
  if (timer) {
    timer.textContent = remain === null ? '–:–' : format(Math.ceil(remain / 1000));
    document.querySelector('#timer-ring').style.setProperty('--progress', active ? Math.min(1, remain / (active.end - active.start)) : 1);
  }
  const remainingCheck = refreshing || disconnected ? 0 : verificationRemaining(active, observed);
  if (remainingCheck) {
    document.querySelector('#verify-time').textContent = Math.ceil(remainingCheck / 1000) + ' ' + t('seconds');
    verification.querySelector('[data-value="break"]').disabled = !running() || pendingPauseAt !== undefined;
    if (!verification.open) verification.showModal();
  } else if (verification.open) verification.close();
  const adButton = document.querySelector('[data-action="reward-ad"]');
  if (adButton) {
    const seconds = adCooldownSeconds(data?.adRetryAt, observed);
    adButton.disabled = openingAd || seconds > 0 || !data?.adPlatforms?.web;
    const help = document.querySelector('#ad-cooldown');
    const label = seconds ? `${t('adCooldown')} · ${format(seconds)}` : !data?.adPlatforms?.web ? t('adUnavailable') : '';
    if (help.textContent !== label) help.textContent = label;
  }
  for (const button of document.querySelectorAll('[data-invite-retry]')) {
    const seconds = inviteWait(Number(button.dataset.inviteRetry), observed);
    button.disabled = seconds > 0;
    const label = seconds ? ` · ${seconds} ${t('secondsShort')}` : '';
    const timer = button.querySelector('small');
    if (timer.textContent !== label) timer.textContent = label;
  }
  updateCoinNotice();
  for (const row of content.querySelectorAll('[data-invite-expires]')) {
    const seconds = inviteWait(Number(row.dataset.inviteExpires), observed);
    row.hidden = seconds === 0;
    const timer = row.querySelector('small b');
    if (timer.textContent !== format(seconds)) timer.textContent = format(seconds);
  }
}

async function closeSession(accountDeleted = false) {
  if (!accountDeleted && data?.profile?.room) await invokeLibrary(client, 'roomPresence', {
    ...roomConnection.payload(), mode: 'disconnect', room: data.profile.room,
  }).catch(() => {});
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error && !accountDeleted) throw error;
  if (!deletionPage) history.replaceState(null, '', '#rooms');
  reflectSession(null);
  toast(t(accountDeleted ? 'accountDeleted' : 'signedOut'));
}

async function leaveRoom() {
  if (busy || !data?.profile?.room || running()) return;
  const room = data.rooms.find(item => item.id === data.profile.room);
  const warning = room?.owned && room.expiresAt ? `\n\n${t('privateRoomClosing')}` : '';
  if (!await accountDialogs.confirm(t('leave'), t('leaveConfirm') + warning)) return;
  if (await request('leave')) {
    location.hash = 'rooms';
  }
}

async function watchRewardAd() {
  if (!data?.adPlatforms?.web) { toast(t('adUnavailable')); return; }
  if (openingAd || adCooldownSeconds(data.adRetryAt, now())) return;
  const viewer = window.open('about:blank', '_blank');
  if (viewer) viewer.opener = null;
  openingAd = true;
  render();
  const viewerId = userId;
  try {
    const { url } = await invokeLibrary(client, 'adStart', { platform: 'web' });
    const placement = new URL(url);
    if (placement.protocol !== 'https:' || placement.username || placement.password || viewerId !== userId || running()) throw Error('adUnavailable');
    if (!viewer || viewer.closed) location.assign(placement.href);
    else viewer.location.replace(placement.href);
    toast(t('adPending'));
  } catch (error) {
    viewer?.close();
    toast(messageFor(error.message, t));
    refreshState();
  } finally {
    openingAd = false;
    render();
  }
}

function redirectTo() {
  return location.origin + (deletionPage ? '/account-deletion' : '/');
}

verification.addEventListener('cancel', event => event.preventDefault());
languageToggle.addEventListener('click', () => {
  if (busy || running()) return;
  locale = locale === 'en' ? 'tr' : 'en';
  try { localStorage.setItem('library-language', locale); }
  catch { /* Use the language for the current page. */ }
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', locale);
    history.replaceState(null, '', url);
  }
  translateChrome();
  render();
});
document.addEventListener('input', event => {
  const field = event.target;
  if (field.name === 'friendCode' || field.name === 'referral') {
    const isReferral = field.name === 'referral';
    const { prefix, suffix } = splitProfileCode(field.value, isReferral ? referralPrefix : 'SK');
    field.value = isReferral || prefix === 'SK' ? suffix : '';
    if (isReferral) updateReferralPrefix(prefix);
  }
  if (field.id === 'custom-duration' || field.id === 'custom-break') {
    if (field.id === 'custom-break') customBreak = field.value;
    else customDuration = field.value;
    document.querySelector('[data-action="start"]').disabled = !validDuration();
    updateClock();
  }
  if (field.id === 'room-search') {
    roomSearch = field.value;
    filterRooms();
  }
  if (field.name === 'name' && field.form?.id === 'avatar-form') draft.avatarName = field.value;
  if (Object.hasOwn(draft, field.name)) draft[field.name] = field.value;
});

function updateReferralPrefix(prefix) {
  referralPrefix = prefix;
  const button = content.querySelector('[data-referral-prefix]');
  if (!button) return;
  button.textContent = prefix + '-';
  button.setAttribute('aria-label', `${t('switchCodePrefix')} · ${prefix}-`);
}

document.addEventListener('click', event => {
  const roomsLink = event.target.closest('nav a[href="#rooms"]');
  if (roomsLink && data?.profile?.room && !expiredLocally && !onBreak() && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    void leaveRoom();
    return;
  }
  if (event.target.closest('[data-referral-prefix]') && !busy) {
    updateReferralPrefix(referralPrefix === 'DV' ? 'SK' : 'DV');
    return;
  }
  const option = event.target.closest('[data-choice]');
  const picker = event.target.closest('.picker');
  document.querySelectorAll('.picker[open]').forEach(open => { if (open !== picker) open.open = false; });
  const presetButton = event.target.closest('[data-avatar-preset]');
  if (presetButton && !busy) {
    const preset = avatarPresets.find(entry => entry.id === presetButton.dataset.avatarPreset);
    if (!preset) return;
    avatar = { ...defaultAvatar, ...preset.look };
    document.querySelector('#avatar-form .form-options').innerHTML = avatarFields();
    document.querySelector('.profile-card > .sprite').outerHTML = sprite(avatar);
    return;
  }
  if (!option || !picker || busy || running()) return;
  const name = picker.dataset.picker;
  const value = option.dataset.choice;
  picker.open = false;
  if (name === 'duration') {
    durationChoice = value;
    render();
    document.querySelector(value === 'custom' ? '#custom-duration' : '[data-picker="duration"] summary')?.focus();
    return;
  }
  if (Object.hasOwn(catalogCategory, name) && Object.hasOwn(categories, value)) {
    catalogCategory[name] = value;
    render();
    document.querySelector(`[data-picker="${name}"] summary`)?.focus();
    return;
  }
  if (name === 'hair' || name === 'outfit') avatar = pickAvatarStyle(avatar, name, Number(value));
  else avatar[name] = Object.hasOwn(avatarOptions, name) ? Number(value) : value;
  if (name === 'gender') document.querySelector('[data-picker="hair"]').closest('.field').outerHTML = pickerForHair();
  picker.querySelector('summary span').textContent = option.textContent;
  picker.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === option)));
  picker.querySelector('summary').focus();
  document.querySelector('.profile-card > .sprite').outerHTML = sprite(avatar);
});

document.addEventListener('keydown', event => {
  const picker = event.target.closest('.picker[open]');
  if (!picker || event.key !== 'Escape') return;
  event.preventDefault();
  picker.open = false;
  picker.querySelector('summary').focus();
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['email-form', 'code-form', 'avatar-form', 'create-room-form', 'join-room-form', 'friend-form'].includes(form.id)) return;
  event.preventDefault();
  if (busy || !client) return;
  const fields = new FormData(form);
  if (form.id === 'email-form' || form.id === 'code-form') {
    if (form.id === 'email-form' && emailSentTo && Date.now() < emailRetryAt) return;
    const button = form.querySelector('button');
    busy = button.disabled = true;
    emailFeedback = '';
    let sent = false;
    try {
      if (form.id === 'email-form') {
        const email = emailSentTo || fields.get('email').trim();
        const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        emailSentTo = email;
        emailRetryAt = Date.now() + 60000;
        draft.code = '';
        sent = true;
      } else {
        if (!emailSentTo) return;
        const { error } = await client.auth.verifyOtp({ email: emailSentTo, token: fields.get('code').trim(), type: 'email' });
        if (error) throw error;
      }
    } catch (error) { emailFeedback = emailAuthMessage(error); }
    finally {
      busy = button.disabled = false;
      if (sent) lastView = undefined;
      render();
      if (sent) document.querySelector('#email-code')?.focus();
    }
    return;
  }
  if (form.id === 'avatar-form') {
    const wasEditing = editing;
    const { prefix, suffix } = splitProfileCode(fields.get('referral') ?? '', referralPrefix);
    if (await request('profile', { ...avatar, name: fields.get('name'), referral: suffix ? `${prefix}-${suffix}` : undefined })) {
      editing = false;
      draft.avatarName = null;
      draft.referral = '';
      referralPrefix = 'DV';
      lastView = undefined;
      if (!wasEditing && !meetingId()) location.hash = 'rooms';
      render();
    }
  } else if (form.id === 'friend-form') {
    const { prefix, suffix } = splitProfileCode(fields.get('friendCode'));
    if (prefix === 'SK' && suffix && await request('addFriend', { code: `${prefix}-${suffix}` })) {
      draft.friendCode = '';
      const field = document.querySelector('#friend-form input');
      if (field) field.value = '';
    }
  } else {
    const create = form.id === 'create-room-form';
    if (await request(create ? 'createRoom' : 'joinCode', create ? { name: fields.get('roomName') } : { code: fields.get('invite') })) {
      draft.roomName = draft.invite = '';
      location.hash = 'room';
    }
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || busy) return;
  const { action, value } = button.dataset;
  if (action === 'open-tour') { showTour(0, 'preview'); return; }
  if (action === 'change-email') {
    emailSentTo = emailFeedback = draft.code = '';
    render();
    document.querySelector('#sign-in-email')?.focus();
    return;
  }
  if (action === 'oauth' && client) {
    busy = button.disabled = true;
    try {
      if (value === 'google' && config.firebaseGoogle) {
        const { signInWithFirebaseGoogle } = await import('./google-sign-in.js');
        await signInWithFirebaseGoogle(client.auth, config.firebaseGoogle, locale);
      } else {
        const { error } = await client.auth.signInWithOAuth({ provider: value, options: { redirectTo: redirectTo() } });
        if (error) throw error;
      }
    } catch (error) {
      const code = error?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        const message = code === 'auth/unauthorized-domain' ? 'googleDomainUnauthorized'
          : code === 'auth/popup-blocked' ? 'googlePopupBlocked' : 'authError';
        toast(t(message));
      }
    } finally {
      busy = button.disabled = false;
    }
    return;
  }
  if (!userId) return;
  if (action === 'delete-account') { await accountDialogs.startDeletion(); return; }
  if (action === 'sign-out') {
    const warning = data?.profile?.room ? `\n\n${t('signOutRoom')}` : '';
    if (!await accountDialogs.confirm(t('signOut'), t('confirmSignOut') + warning)) return;
    busy = true;
    try { await closeSession(); }
    catch (error) { toast(messageFor(error.message, t)); }
    finally { busy = false; }
    return;
  }
  if (action === 'setDoNotDisturb' && data?.profile) {
    await request(action, { enabled: !data.profile.doNotDisturb });
    return;
  }
  if (!data?.profile || (running() && action !== 'verify' && !(action === 'status' && value === 'break'))) return;
  if (action === 'leave') { await leaveRoom(); return; }
  if (action === 'copy-profile-code') { toast(t(await copyText(value) ? 'codeCopied' : 'codeCopyError')); return; }
  if (action === 'share-profile-code') { await shareProfileCode(value, button.dataset.label); return; }
  if (action === 'copy-share-text') {
    shareCodeStatus.textContent = t(await copyText(shareCodeText.value) ? 'codeCopied' : 'codeCopyError');
    return;
  }
  if (action === 'coin-help') { coinHelp.showModal(); return; }
  if (action === 'reward-ad') { await watchRewardAd(); return; }
  if (action === 'invite-dialog') {
    renderInviteOptions();
    updateClock();
    inviteDialog.showModal();
    return;
  }
  if (action === 'edit') {
    avatar = { ...defaultAvatar, ...data.profile.avatar };
    editing = true;
    render();
    return;
  }
  if (action === 'join' && data.profile.room === value) { location.hash = 'room'; return; }
  if (action === 'ranking-retry') { ranking = undefined; render(); return; }
  if (action === 'study-card') {
    button.disabled = true;
    try { await openStudyCard(); } finally { button.disabled = false; }
    return;
  }
  if (action === 'select-desk') {
    selectedDesk = data.members.find(member => member.desk_ref === value && !member.own);
    if (selectedDesk) {
      reactionDialog.querySelector('[data-desk-feedback]').textContent = '';
      refreshDeskDialog();
      reactionDialog.showModal();
    }
    return;
  }
  if (action === 'react' || action === 'addDeskFriend') {
    if (!selectedDesk || button.disabled) return;
    reactionDialog.querySelector('[data-desk-feedback]').textContent = '';
  }
  if (action === 'room-visibility') {
    const room = data.rooms.find(item => item.id === data.profile.room && item.owned);
    if (!room) return;
    const publish = Boolean(room.private);
    const label = t(publish ? 'roomMakePublic' : 'roomMakePrivate');
    if (await accountDialogs.confirm(label, t(publish ? 'roomPublicConfirm' : 'roomPrivateConfirm'))
      && await request('roomVisibility', { room: room.id, public: publish })) toast(t(publish ? 'roomMadePublic' : 'roomMadePrivate'));
    return;
  }
  if (action === 'abandon' && !confirm(t('abandonConfirm'))) return;
  const payload = {
    join: { room: value }, status: { status: value }, start: { duration: duration(), breakMinutes: breakLength(), planId: data.todayPlans?.some(plan => plan.id === chosenPlan) ? chosenPlan : undefined },
    openBox: { tier: value, price: Number(button.dataset.price) }, buy: { item: value }, place: { item: value }, react: { desk: selectedDesk?.desk_ref, kind: value },
    addDeskFriend: { desk: selectedDesk?.desk_ref },
    rankingVisibility: { visible: value === 'true' },
    answerFriend: { id: value, answer: button.dataset.answer }, removeFriend: { id: value },
    inviteFriend: { id: value }, answerStudyInvite: { id: value, answer: button.dataset.answer },
  };
  const pausing = running() && action === 'status' && value === 'break';
  if (pausing) { pendingPauseAt = now(); updateClock(); }
  const success = await request(action, payload[action]);
  if (pausing) { pendingPauseAt = undefined; updateClock(); }
  if (success) {
    if (action === 'join' || (action === 'answerStudyInvite' && data.joinedInvite)) location.hash = 'room';
    if (action === 'buy') toast(t('buySuccess'));
    if (action === 'react') { reactionDialog.close(); toast(t('reactionSent')); }
    if (action === 'addDeskFriend') { reactionDialog.close(); toast(t('friendSent')); }
    if (action === 'inviteFriend') {
      toast(t('studyInviteSent'));
    }
    if (action === 'rankingVisibility') { ranking = undefined; render(); }
  }
});

roomPreferences.attach(document, () => busy || running());
translateChrome();
cardDialog.addEventListener('close', () => {
  cardGeneration++;
  cardModel = cardFile = undefined;
  if (cardUrl) URL.revokeObjectURL(cardUrl);
  cardDialog.querySelector('img').removeAttribute('src');
  cardDialog.querySelector('[data-card-download]').replaceChildren();
  cardUrl = undefined;
});
content.addEventListener('change', event => {
  if (event.target.id === 'focus-plan') chosenPlan = event.target.value;
});
window.addEventListener('hashchange', render);
window.addEventListener('offline', () => {
  if (data?.profile?.room) { disconnected = true; updateClock(); }
});
window.addEventListener('online', refreshState);
document.addEventListener('visibilitychange', () => {
  roomConnection.advance();
  if (document.hidden) void sendRoomPresence('background');
  else if (userId) { refreshing = true; updateClock(); refreshState(); }
});
window.addEventListener('pagehide', event => {
  roomConnection.advance();
  void sendRoomPresence(event.persisted ? 'background' : 'disconnect');
});
window.addEventListener('pageshow', event => {
  if (event.persisted && !document.hidden) { roomConnection.advance(); refreshState(); }
});
if (client) {
  render();
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url);
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) toast(t('authLinkError'));
  }
  const { data: auth } = await client.auth.getSession();
  reflectSession(auth.session);
  client.auth.onAuthStateChange((_event, updated) => setTimeout(() => reflectSession(updated), 0));
} else render();
setInterval(() => {
  const interval = data?.profile?.room && !presenceReady ? 1000 : 5000;
  if (!document.hidden && performance.now() - lastRead >= interval) void request('state');
}, 1000);
setInterval(updateClock, 200);
setInterval(() => {
  if (!data?.profile || document.hidden || running()) return;
  for (const plan of data.todayPlans ?? []) {
    const due = plan.reminderAt;
    const key = plan.id + ':' + due;
    if (!due || due > now() || now() - due > 20 * 60000 || reminderIds.has(key)) continue;
    reminderIds.add(key);
    const marker = 'vsc-plan-reminder-' + userId;
    try {
      const seen = JSON.parse(localStorage.getItem(marker) ?? '[]');
      if (seen.includes(key)) continue;
      localStorage.setItem(marker, JSON.stringify([...seen.slice(-79), key]));
    } catch {}
    toast(t('plannerRemindNow') + ' · ' + plan.topic);
    break;
  }
}, 4000);
