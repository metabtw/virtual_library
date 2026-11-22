import { createClient } from './supabase-web.js';
import { config } from './config.js';
import { createRoomConnection, emailAuthMessage, invokeLibrary } from './library-client.js';
import { focusRemaining, markServerTime, serverTimeAt, verificationRemaining } from './focus-clock.js';
import { displayDeskStatuses, recordDeskStatus } from './desk-status.js';
import { portrait, propImage, writingFrames } from './sprites.js';
import { avatarOptions, avatarPresets, defaultAvatar, deskEquipment, dressedAvatar, hairStyles,
  hasPropArt, petAppearance, pickAvatarStyle, writingSize } from './avatar-art.js';
import { createRoomPreferences } from './room-preferences.js';
import { downloadStudyCard, messageFor, reactionArt } from './web-social.js';
import { webText } from './web-strings.js';
import { adCooldownSeconds, mysteryBoxPrice, roomGoalMinutes } from './study-rewards.js';
import { dailyQuests, friendsPanel, studyInviteButton, studyInvitations } from './community.js';
import { inviteWait, splitProfileCode } from './room-social.js';

const client = config && createClient(config.url, config.key, {
  auth: { flowType: 'pkce', detectSessionInUrl: false },
});
if (config?.firebaseGoogle) void import('./google-sign-in.js').catch(() => {});
const deletionPage = location.pathname === '/account-deletion';
const content = document.querySelector('#content');
const notice = document.querySelector('#notice');
const verification = document.querySelector('#verify-dialog');
const reactionDialog = document.querySelector('#reaction-dialog');
const inviteDialog = document.querySelector('#study-invite-dialog');
const coinHelp = document.querySelector('#coin-help-dialog');
const shareCodeDialog = document.querySelector('#share-code-dialog');
const shareCodeText = document.querySelector('#share-code-text');
const shareCodeStatus = document.querySelector('#share-code-status');
const languageToggle = document.querySelector('#language-toggle');
const labels = { room: 'library', rooms: 'rooms', shop: 'shop', profile: 'profileInventory', ranking: 'leaderboard' };
const palette = ['#bd7050', '#789078', '#7988ab', '#ad7963'];
const roomIcons = { night: '☾', garden: '❧', archive: '✦' };
const categories = {
  all: 'catalogAll', wearable: 'catalogClothes', hair: 'catalogHair', desk: 'catalogDesk',
  pet: 'catalogPets', ambience: 'catalogSound', rare: 'catalogChests',
};
const draft = { email: '', code: '', avatarName: null, target: null, roomName: '', invite: '', referral: '', friendCode: '' };
const seenReactions = new Set();
const roomConnection = createRoomConnection();
let locale = initialLanguage();
const t = key => webText(locale, key);
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
const validDuration = () => Number.isInteger(duration()) && duration() >= 5 && duration() <= 180;
const session = () => data?.session?.state === 'active' ? data.session : null;
const running = () => session()?.paused_at === null;
const placed = () => data.inventory.filter(entry => entry.placed).map(entry => entry.item);
const now = () => clock ? serverTimeAt(clock) : 0;
const localName = item => locale === 'en' ? item.name_en || item.name : item.name;
const privacyHref = () => '/privacy?lang=' + locale;
const deletionHref = () => '/account-deletion?lang=' + locale;
const profileHref = () => '/?lang=' + locale + '#profile';

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
  const text = `${title} · ${label} ${code}`;
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
  const mutation = action !== 'state';
  if (!mutation && stateRequest) return false;
  if (mutation) { busy = true; revision++; }
  const read = {};
  if (!mutation) { stateRequest = read; lastRead = performance.now(); refreshRequested = false; }
  const version = revision;
  try {
    const result = await invokeLibrary(client, action, { ...payload, ...roomConnection.payload(), foreground: !document.hidden });
    if (version !== revision || (data && result.now < data.now)) return false;
    if (data?.session?.state !== result.session?.state && result.session?.state === 'completed') toast(t('reward'));
    if (data?.session?.state !== result.session?.state && result.session?.state === 'invalid') toast(t('invalid'));
    data = result;
    clock = markServerTime(result.now);
    refreshing = false;
    syncPresence();
    if (document.hidden && result.profile?.room) void sendRoomPresence('background');
    const incoming = (result.reactions ?? []).filter(event => !seenReactions.has(event.id));
    for (const event of incoming) seenReactions.add(event.id);
    if (seenReactions.size > 128) for (const id of [...seenReactions].slice(0, 64)) seenReactions.delete(id);
    if (incoming.length) toast(incoming.map(event =>
      `${reactionArt[event.kind]} ${event.name} ${t(event.kind === 'coffee' ? 'coffeeReceived' : 'clapReceived')}`).join(' · '));
    if (result.drop) {
      const prize = result.items.find(item => item.id === result.drop.item);
      toast(t(action === 'openBox' ? 'prize' : 'rewardDrop') + ' · ' +
        (prize ? localName(prize) : result.drop.item ?? result.drop.coins + ' ' + t('coins')));
    }
    if (['target', 'place', 'profile', 'react'].includes(action)) trackPresence(presence, result.now);
    return true;
  } catch (error) {
    if (version === revision && (mutation || !data)) toast(messageFor(error.message, t));
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
  if (id === userId && lastView !== undefined) return;
  revision++;
  userId = id;
  data = clock = ranking = rankingRequest = undefined;
  busy = refreshing = editing = false;
  avatar = { ...defaultAvatar };
  draft.avatarName = draft.target = null;
  draft.roomName = draft.invite = draft.referral = draft.friendCode = '';
  referralPrefix = 'DV';
  stateRequest = undefined;
  refreshRequested = false;
  roomSearch = '';
  catalogCategory.shop = catalogCategory.inventory = 'all';
  lastRead = 0;
  lastView = lastScene = undefined;
  seenReactions.clear();
  emailSentTo = emailFeedback = draft.code = '';
  emailRetryAt = 0;
  syncPresence();
  render();
  if (id && !deletionPage) void request('state');
}

function signInView() {
  if (!client) return `<section class="card account-card">${deletionPage ? backToProfile() : ''}
    <h1>${t('app')}</h1><p>${t('missingConfig')}</p><a href="${privacyHref()}">${t('readPrivacy')}</a></section>`;
  return `<section class="card account-card auth-card">
    <div class="auth-heading"><img class="auth-emblem" src="/favicon.png" width="45" height="45" alt=""><h1>${t(deletionPage ? 'deleteAccount' : 'signInTitle')}</h1></div>
    ${deletionPage ? '' : `<p>${t('siteIntro')}</p>`}
    ${config.google || config.apple ? `<div class="auth-providers">
      ${config.google ? `<button class="secondary" data-action="oauth" data-value="google">${t('google')}</button>` : ''}
      ${config.apple ? `<button class="secondary" data-action="oauth" data-value="apple">${t('apple')}</button>` : ''}
    </div>` : ''}
    ${emailSentTo ? `<p>${t('emailSent')}<strong class="auth-address">${escape(emailSentTo)}</strong></p>
      <form id="code-form" class="stacked"><label class="field">${t('code')} <input id="email-code" name="code" type="text" required
        inputmode="numeric" pattern="[0-9]{6,10}" maxlength="10" autocomplete="one-time-code" value="${escape(draft.code)}"></label>
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
    <div class="auth-links"><a href="${privacyHref()}">${t('readPrivacy')}</a>
    ${deletionPage ? backToProfile() : `<a href="${deletionHref()}">${t('deletionPage')}</a>`}</div>
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
      ${atDesk ? `<span class="desk-writing" style="--writing-frames:${writingSize.frames}"><img src="${writingFrames(member.avatar.skin_tone)}" alt=""></span>` : '<span class="book"></span>'}
    </div>
    ${member ? deskItems(member.placed, member.pet) : ''}
    ${canReact ? `<button class="seat-name" data-action="select-desk" data-value="${escape(member.desk_ref)}" aria-label="${name} · ${t('deskReaction')}">${name}</button>` : `<div class="seat-name">${name}</div>`}
    ${member?.target ? `<span class="seat-target">${escape(member.target)}</span>` : ''}
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
  const durationOptions = ['25', '50', '90'].map(value => [value, value + ' ' + t('minutes')]);
  durationOptions.push(['custom', t('customDuration')]);
  const controls = running()
    ? `<button class="primary" data-action="status" data-value="break">${t('pause')}</button>`
    : paused && room
      ? `<button class="primary" data-action="status" data-value="desk">▶ &nbsp; ${t('resume')}</button><button class="secondary" data-action="abandon">${t('abandon')}</button>`
      : room
        ? `<div class="status-group"><button data-action="status" data-value="desk" aria-pressed="${data.profile.status === 'desk'}">▣ ${t('desk')}</button><button data-action="status" data-value="break" aria-pressed="${data.profile.status === 'break'}">☕ ${t('break')}</button></div>
        <div class="period-settings">${picker('duration', t('periodDuration'), durationChoice, durationOptions)}
        ${durationChoice === 'custom' ? `<label class="field custom-duration">${t('minutes')} <input id="custom-duration" type="number" inputmode="numeric" min="5" max="180" step="1" value="${escape(customDuration)}"><small>${t('duration')}</small></label>` : ''}
        </div>
        <button class="primary" data-action="start" ${validDuration() ? '' : 'disabled'}>▶ &nbsp; ${t('start')}</button>`
        : `<a class="primary" href="#rooms">${t('joinRoom')}</a>`;
  const minutes = room?.minutes ?? 0;
  const hasFriends = data.friends?.some(friend => friend.status === 'accepted');
  return `<div class="room-layout">
    <div class="heading compact-heading room-heading"><div class="room-identity"><h1 id="room-title">${name}</h1>
      ${room?.private ? `<span class="private-badge">${t('privateBadge')}</span>` : ''}</div>
      ${room && hasFriends && !running() ? `<button class="secondary invite-friends" data-action="invite-dialog"
        aria-label="${t('friendInvite')}" title="${t('friendInvite')}"><span aria-hidden="true">♙+</span><b>${t('friendInvite')}</b></button>` : ''}
    </div>
    ${room ? `<div class="room-goal" title="${t('chestGoalInfo')}"><span>🎁 ${t('chestGoal')}</span>
      <progress aria-label="${t('groupMinutes')}" max="${roomGoalMinutes}" value="${minutes % roomGoalMinutes}"></progress>
      <b>${minutes % roomGoalMinutes}/${roomGoalMinutes}</b></div>` : ''}
    <div class="room-stage">
      <section class="scene" data-room-theme="${roomPreferences.themeFor(room)}" aria-labelledby="room-title">
        <div class="scene-top"><span><span class="dot"></span> <span id="room-count">${room?.count ?? 0}</span> / ${room?.capacity ?? 9} ${t('people')}</span><span>☾ &nbsp; ${t('quietRoom')}</span></div>
        <div id="room-seats"></div>
      </section>
    </div>
    <div class="room-panel">
      <section class="controls" aria-labelledby="focus-title">
        <div class="timer"><div class="timer-ring" id="timer-ring"><b id="timer">50:00</b></div>
          <div class="timer-copy"><h2 id="focus-title">${t('focus')}</h2><p>${t(running() ? 'focusing' : paused ? 'paused' : 'every20')}</p></div>
        </div>
        <div class="control-actions">${controls}${room && !running() ? `<button class="secondary" data-action="leave">${t('leave')}</button>` : ''}</div>
      </section>
      ${room && !running() ? `<section class="room-settings" aria-labelledby="room-settings-title">
        <h2 id="room-settings-title">${t('roomSettings')}</h2>
        ${roomPreferences.markup(room, data.inventory)}
        ${room.invite ? `<p class="room-meta">${t('inviteCode')} <b>${escape(room.invite)}</b></p>` : ''}
      </section>` : ''}
    </div>
  </div>`;
}

function roomsView() {
  return `<div class="heading compact-heading"><h1>${t('rooms')}</h1><a class="secondary" href="#ranking">${t('leaderboard')}</a></div>
  ${studyInvitations(data, t, escape, locale)}
  <label class="field room-search">${t('searchTarget')} <input type="search" id="room-search" value="${escape(roomSearch)}"></label>
  <div class="room-grid room-list">${data.rooms.map(room => `<article class="card room-card" data-room-id="${escape(room.id)}">
    <span class="item-icon" aria-hidden="true">${room.private ? '◆' : roomIcons[room.id] ?? '☾'}</span>
    <div class="room-card-title"><h2>${escape(localName(room))}</h2>${room.private ? `<span class="private-badge">${t('privateBadge')}</span>` : ''}</div>
    ${room.targets?.length ? `<p class="room-targets">${escape(room.targets.join(' · '))}</p>` : ''}
    <p><span class="dot"></span> ${room.count} / ${room.capacity} ${t('people')}</p>
    <button class="primary" data-action="join" data-value="${escape(room.id)}" ${room.count >= room.capacity && data.profile?.room !== room.id ? 'disabled' : ''}>${t(data.profile?.room === room.id ? 'open' : room.count >= room.capacity ? 'roomFull' : 'joinRoom')}</button>
  </article>`).join('')}</div>
  <p id="room-search-empty" role="status" hidden>${t('noRooms')}</p>
  <div class="room-grid room-actions private-actions">
    ${data.profile.ownsPrivateRoom ? `<div class="card room-owned" role="status"><p>${t('privateRoomOwned')}</p></div>` : `<form class="card stacked" id="create-room-form"><label class="field">${t('roomName')} <input name="roomName" value="${escape(draft.roomName)}" required minlength="2" maxlength="32"></label><button class="primary">${t('createRoom')}</button></form>`}
    <form class="card stacked" id="join-room-form"><label class="field">${t('inviteCode')} <input name="invite" value="${escape(draft.invite)}" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6"></label><button class="secondary">${t('joinCode')}</button></form>
  </div>`;
}

function filterRooms() {
  const normalize = name => name.normalize('NFC').toLocaleLowerCase(locale);
  const term = normalize(roomSearch.trim());
  const matches = new Set(data.rooms.filter(room =>
    [room.name, room.name_en, ...(room.targets ?? [])].some(value => value && normalize(value).includes(term)))
    .map(room => room.id));
  for (const card of content.querySelectorAll('.room-card')) card.hidden = !matches.has(card.dataset.roomId);
  document.querySelector('#room-search-empty').hidden = matches.size > 0;
}

function itemImage(item) {
  if (item.kind === 'wearable' || item.kind === 'hair') return sprite(dressedAvatar(data.profile.avatar, [item.id]));
  if (item.id === 'plant') return `<span class="catalog-plant"><img src="${propImage('leaves')}" alt=""><img src="${propImage('pot')}" alt=""></span>`;
  return hasPropArt(item.id) ? `<img src="${propImage(item.id)}" alt="">` : '✦';
}

function itemCards(items, inventoryOnly, firstCard = '') {
  return `<div class="cards">${firstCard}${items.map(item => {
    const owned = data.inventory.find(entry => entry.item === item.id);
    const rare = item.kind === 'rare';
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

function mysteryBoxCard() {
  const prizes = data.items.filter(item => item.kind === 'rare');
  if (!prizes.length) return '';
  const available = prizes.some(item => !data.inventory.some(entry => entry.item === item.id));
  return `<article class="card rare-card mystery-box">
    <span class="item-icon item-preview"><img src="${propImage('mysteryBox')}" alt=""></span>
    <h2>${t('box')}</h2><p>${t(available ? 'boxRules' : 'collectionComplete')}</p>
    <button class="primary" data-action="openBox" ${!available || data.profile.coins < mysteryBoxPrice ? 'disabled' : ''}>${t('openBox')}</button>
  </article>`;
}

function catalog(inventoryOnly) {
  const scope = inventoryOnly ? 'inventory' : 'shop';
  const activeCategory = catalogCategory[scope];
  const choices = data.items.filter(item => !inventoryOnly || data.inventory.some(entry => entry.item === item.id));
  const visible = activeCategory === 'all' ? choices : choices.filter(item => item.kind === activeCategory);
  const regular = inventoryOnly ? visible : visible.filter(item => item.kind !== 'rare');
  const prizes = inventoryOnly ? [] : visible.filter(item => item.kind === 'rare');
  const box = !inventoryOnly && (activeCategory === 'all' || activeCategory === 'rare') ? mysteryBoxCard() : '';
  return `<div class="catalog-filter">${picker(scope, t('catalogFilter'), activeCategory,
    Object.entries(categories).map(([value, label]) => [value, t(label)]))}</div>
    ${!visible.length ? `<p class="empty-message">${t(inventoryOnly && !choices.length ? 'emptyInventory' : 'catalogEmpty')}</p>` : ''}
    ${regular.length || box ? itemCards(regular, inventoryOnly, box) : ''}
    ${prizes.length ? `<h2 class="section-title">${t('catalogChests')}</h2><p>${t('chestCollectionInfo')}</p>${itemCards(prizes, false)}` : ''}`;
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
  const targetOpen = content.querySelector('#study-target')?.open;
  return `<div class="heading${profile ? ' profile-heading' : ''}"><h1>${t(profile ? 'profileInventory' : 'newAvatar')}</h1>
    ${profile ? `<div class="profile-shortcuts">
      <button class="secondary" data-action="study-card" aria-label="${t('downloadCard')}">${t('studyCardAction')}</button>
      <a class="secondary" href="#ranking">${t('leaderboard')}</a>
    </div>` : ''}
  </div>
  <section class="profile-card${profile && !editing ? ' profile-overview' : ''}">${sprite(editing || !profile ? avatar : dressedAvatar(profile.avatar, placed()))}
  ${editing || !profile ? `<form id="avatar-form"><label>${t('name')}<input name="name" value="${escape(draft.avatarName ?? profile?.name)}" minlength="2" maxlength="24" required></label>
  ${!profile ? `<div class="field"><label for="registration-code">${t('referralField')}</label>
    <div class="code-field"><button type="button" class="secondary" data-referral-prefix aria-label="${t('switchCodePrefix')} · ${referralPrefix}-">${referralPrefix}-</button>
    <input id="registration-code" name="referral" value="${escape(draft.referral)}" maxlength="15" autocapitalize="characters" autocomplete="off"></div></div>` : ''}
  ${avatarPresetPicker()}<div class="form-options">${avatarFields()}</div><button class="primary">${t('saveAvatar')}</button></form>` : `<div class="profile-details"><h2>${name}</h2>
    ${profile.target ? `<p>${escape(profile.target)}</p>` : ''}
    <dl class="profile-codes">
      ${readerCode ? profileCode('readerCode', readerCode) : profileCode('accountId', userId, false)}
      ${referralCode ? profileCode('referralCode', referralCode) : ''}
    </dl>
    <div class="profile-hero-actions"><button class="secondary" data-action="edit">${t('editAvatar')}</button>
    ${profile.room ? `<button class="secondary" data-action="leave">${t('leave')}</button>` : ''}</div></div>`}</section>
  ${profile ? `<details id="study-target" class="card target-editor private-actions" ${targetOpen ? 'open' : ''}>
      <summary>${t('studyTarget')}</summary>
      <form id="target-form" class="stacked"><label class="field">${t('target')}
        <input name="target" maxlength="48" placeholder="${t('targetHint')}" value="${escape(draft.target ?? profile.target)}"></label>
        <button class="secondary">${t('saveTarget')}</button>
      </form>
    </details>
    ${dailyQuests(data.dailyQuests, t)}${studyInvitations(data, t, escape, locale)}${friendsPanel(data, draft.friendCode, t, escape)}
    <h2 class="section-title">${t('inventory')}</h2><p class="equipment-note">${t('equipmentLimit')}</p>${catalog(true)}` : ''}
  <section class="card account-section" aria-labelledby="account-title">
    <h2 id="account-title">${t('myAccount')}</h2>
    <div class="account-actions">
      <a class="secondary account-button account-data" href="${privacyHref()}">${t('myData')}</a>
      <button class="secondary account-button account-sign-out" data-action="sign-out">${t('signOut')}</button>
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
  ${dailyQuests(data.dailyQuests, t)}${catalog(false)}`;
}

function rankingView() {
  const header = `<div class="heading"><h1>${t('leaderboard')}</h1></div>`;
  if (!ranking) return header + `<p>${t('loading')}</p>`;
  if (ranking.error) return `${header}<p>${messageFor(ranking.error, t)}</p><button class="secondary" data-action="ranking-retry">${t('retry')}</button>`;
  return `${header}<section class="card">
    <p>${escape(ranking.starts)} – ${escape(ranking.ends)} · ${t('istanbulTime')}</p>
    <p>${t('rankingInfo')}</p>
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

function paint(signature, html) {
  if (signature === lastView) return;
  const active = document.activeElement;
  let restore;
  if (active instanceof HTMLInputElement && content.contains(active)) {
    const selector = active.id ? '#' + CSS.escape(active.id) : active.form?.id && `#${CSS.escape(active.form.id)} [name="${CSS.escape(active.name)}"]`;
    if (selector) restore = { selector, start: active.selectionStart, end: active.selectionEnd };
  }
  content.innerHTML = html();
  if (restore) {
    const input = content.querySelector(restore.selector);
    input?.focus({ preventScroll: true });
    if (input && restore.start !== null) input.setSelectionRange(restore.start, restore.end);
  }
  lastView = signature;
  lastScene = undefined;
}

function render() {
  const page = location.hash.slice(1);
  const lock = running();
  const sidebar = document.querySelector('.sidebar');
  sidebar.inert = lock || !userId || deletionPage;
  languageToggle.disabled = lock;
  document.body.classList.toggle('focusing', lock);
  document.querySelector('#balance').textContent = data?.profile?.coins ?? 0;
  const unread = (data?.friends?.filter(friend => friend.status === 'incoming').length ?? 0) + (data?.studyInvites?.length ?? 0);
  const notification = document.querySelector('#social-unread');
  notification.hidden = !unread;
  notification.textContent = unread || '';
  if (lock || !userId) {
    if (inviteDialog.open) inviteDialog.close();
    if (coinHelp.open) coinHelp.close();
    if (shareCodeDialog.open) shareCodeDialog.close();
  }
  if (!userId || deletionPage || !data) {
    roomPreferences.sync(null);
    if (verification.open) verification.close();
    const signIn = !userId;
    document.querySelector('#location').textContent = t(signIn ? 'signIn' : deletionPage ? 'deletionPage' : 'library');
    paint(JSON.stringify([signIn, deletionPage, emailSentTo, emailFeedback, Boolean(data), locale]),
      signIn ? signInView : deletionPage ? deletionView : () => `<p>${t('loading')}</p>`);
    updateEmailResend();
    return;
  }
  const inRoom = Boolean(data.profile?.room);
  const roomLocked = lock || (page === 'rooms' && inRoom);
  const view = !data.profile ? 'profile' : roomLocked ? 'room' : Object.hasOwn(labels, page) ? page : 'room';
  if (roomLocked && page !== 'room') history.replaceState(null, '', '#room');
  document.querySelector('#location').textContent = t(labels[view]);
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if ((view !== 'room' || lock) && reactionDialog.open) reactionDialog.close();
  const room = data.rooms.find(item => item.id === data.profile?.room);
  const signature = JSON.stringify([view, view === 'room'
    ? [room?.id, room?.minutes, room?.invite, data.profile?.status, data.session, durationChoice, data.inventory,
      data.friends?.some(friend => friend.status === 'accepted')]
    : view === 'rooms' ? [data.rooms, data.studyInvites, data.profile.ownsPrivateRoom] : view === 'ranking' ? ranking
      : [data.profile, data.inventory, data.items, data.dailyQuests,
        view === 'shop' ? [data.chests, data.adPlatforms?.web, openingAd] : [data.friends, data.studyInvites]], editing, locale,
  catalogCategory[view === 'profile' ? 'inventory' : view]]);
  paint(signature, () => view === 'room' ? roomView(room) : view === 'rooms' ? roomsView()
    : view === 'profile' ? profileView() : view === 'ranking' ? rankingView() : shopView());
  roomPreferences.sync(view === 'room' ? room : null, data.inventory);
  if (view === 'rooms') filterRooms();
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
  const remain = active ? focusRemaining(active, pendingPauseAt ?? observed) : validDuration() ? duration() * 60000 : null;
  const timer = document.querySelector('#timer');
  if (timer) {
    timer.textContent = remain === null ? '–:–' : format(Math.ceil(remain / 1000));
    document.querySelector('#timer-ring').style.setProperty('--progress', active ? Math.min(1, remain / (active.end - active.start)) : 1);
  }
  const remainingCheck = refreshing ? 0 : verificationRemaining(active, observed);
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
  for (const row of content.querySelectorAll('[data-invite-expires]')) {
    const seconds = inviteWait(Number(row.dataset.inviteExpires), observed);
    row.hidden = seconds === 0;
    const timer = row.querySelector('small b');
    if (timer.textContent !== format(seconds)) timer.textContent = format(seconds);
  }
}

async function leaveRoom() {
  if (busy || !data?.profile?.room || running()) return;
  const room = data.rooms.find(item => item.id === data.profile.room);
  const warning = room?.owned && room.count <= 1 ? `\n\n${t('privateRoomClosing')}` : '';
  if (!confirm(t('leaveConfirm') + warning)) return;
  if (await request('leave')) {
    location.hash = 'rooms';
    if (data.privateRoomClosing) toast(t('privateRoomClosing'));
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
  if (field.id === 'custom-duration') {
    customDuration = field.value;
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
  if (roomsLink && data?.profile?.room && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
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
  if (!['email-form', 'code-form', 'avatar-form', 'target-form', 'create-room-form', 'join-room-form', 'friend-form'].includes(form.id)) return;
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
      if (!wasEditing) location.hash = 'rooms';
      render();
    }
  } else if (form.id === 'target-form') {
    if (await request('target', { target: fields.get('target') })) {
      draft.target = null;
      const input = content.querySelector('#target-form input');
      if (input) input.value = data?.profile?.target ?? '';
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
        const firebaseConfig = location.protocol === 'https:' && location.hostname === config.firebaseGoogleDomain
          ? { ...config.firebaseGoogle, authDomain: config.firebaseGoogleDomain }
          : config.firebaseGoogle;
        await signInWithFirebaseGoogle(client.auth, firebaseConfig, locale);
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
  if (action === 'sign-out' || action === 'delete-account') {
    if (action === 'delete-account' && !confirm(t('confirmDelete'))) return;
    busy = button.disabled = true;
    try {
      if (action === 'delete-account') await invokeLibrary(client, 'deleteAccount');
      else await invokeLibrary(client, 'roomPresence', { ...roomConnection.payload(), mode: 'disconnect', room: data?.profile?.room }).catch(() => {});
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error && action !== 'delete-account') throw error;
      reflectSession(null);
      toast(t(action === 'delete-account' ? 'accountDeleted' : 'signedOut'));
    } catch (error) { toast(messageFor(error.message, t)); }
    finally { busy = button.disabled = false; }
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
    try {
      const summary = await invokeLibrary(client, 'studySummary');
      await downloadStudyCard(summary, { ...data.profile, avatar: dressedAvatar(data.profile.avatar, placed()) }, locale);
    } catch { toast(t('downloadFailed')); }
    finally { button.disabled = false; }
    return;
  }
  if (action === 'select-desk') {
    selectedDesk = data.members.find(member => member.desk_ref === value && !member.own);
    if (selectedDesk) {
      reactionDialog.querySelector('h2').textContent = selectedDesk.name;
      reactionDialog.showModal();
    }
    return;
  }
  if (action === 'react' && !selectedDesk) return;
  if (action === 'abandon' && !confirm(t('abandonConfirm'))) return;
  const payload = {
    join: { room: value }, status: { status: value }, start: { duration: duration() },
    buy: { item: value }, place: { item: value }, react: { desk: selectedDesk?.desk_ref, kind: value },
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
    if (action === 'inviteFriend') {
      toast(t('studyInviteSent'));
    }
    if (action === 'rankingVisibility') { ranking = undefined; render(); }
  }
});

roomPreferences.attach(document, () => busy || running());
translateChrome();
window.addEventListener('hashchange', render);
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
