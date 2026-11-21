import { createClient } from './supabase-web.js';
import { config } from './config.js';
import { invokeLibrary } from './library-client.js';
import { focusRemaining, markServerTime, serverTimeAt, verificationRemaining } from './focus-clock.js';
import { portrait, propImage, writingFrames } from './sprites.js';
import { dressedAvatar, hairStyles, hasPropArt, writingSize } from './avatar-art.js';
import { createRoomPreferences } from './room-preferences.js';
import { downloadStudyCard, messageFor, reactionArt } from './web-social.js';

const client = config && createClient(config.url, config.key, {
  auth: { flowType: 'pkce', detectSessionInUrl: false },
});
const deletionPage = location.pathname === '/account-deletion';
const content = document.querySelector('#content');
const notice = document.querySelector('#notice');
const verification = document.querySelector('#verify-dialog');
const reactionDialog = document.querySelector('#reaction-dialog');
const labels = { room: 'Kütüphane', rooms: 'Odalar', shop: 'Mağaza', profile: 'Profil & Envanter', ranking: 'Haftalık sıralama' };
const palette = ['#bd7050', '#789078', '#7988ab', '#ad7963'];
const baseAvatar = { gender: 'unspecified', hair: 0, outfit: 0, color: palette[0] };
const roomIcons = { night: '☾', garden: '❧', archive: '✦' };
const itemIcons = { space: '🪐', forest: '🌲' };
const deskLights = ['neon', 'mushroomLamp', 'lamp'];
const deskDecorations = [
  'goldKeys', 'dragon', 'teaSet', 'hourglass', 'foxMug', 'retroRadio',
  'miniGlobe', 'crystalTerrarium', 'jellyTank', 'origamiCrane',
];
const genders = [['unspecified', 'Belirtmek istemiyorum'], ['female', 'Kadın'], ['male', 'Erkek']];
const durationOptions = [['25', '25 dakika'], ['50', '50 dakika'], ['90', '90 dakika'], ['custom', 'Özel süre']];
const draft = { email: '', code: '', target: null, roomName: '', invite: '' };
const seenReactions = new Set();
const roomPreferences = createRoomPreferences();

let userId;
let data;
let clock;
let revision = 0;
let busy = false;
let refreshing = false;
let presence;
let presenceRoom;
let noticeTimeout;
let pendingPauseAt;
let stateRequest;
let lastRead = 0;
let lastView;
let lastScene;
let avatar = { ...baseAvatar };
let editing = false;
let durationChoice = '50';
let customDuration = '35';
let emailSent = false;
let selectedDesk;
let ranking;
let rankingRequest;

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const duration = () => Number(durationChoice === 'custom' ? customDuration : durationChoice);
const validDuration = () => Number.isInteger(duration()) && duration() >= 5 && duration() <= 180;
const session = () => data?.session?.state === 'active' ? data.session : null;
const running = () => session()?.paused_at === null;
const placed = () => data.inventory.filter(entry => entry.placed).map(entry => entry.item);
const now = () => clock ? serverTimeAt(clock) : 0;

function toast(message) {
  notice.textContent = message;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { notice.textContent = ''; }, 4500);
}

function syncPresence() {
  const room = data?.profile?.room;
  if (room === presenceRoom) return;
  if (presence) void client.removeChannel(presence);
  presence = undefined;
  presenceRoom = room;
  if (!room || !userId) return;
  const channel = client.channel('room:' + room, { config: { private: true, presence: { key: userId } } });
  presence = channel;
  channel.on('presence', { event: 'sync' }, () => { void request('state'); })
    .subscribe(status => {
      if (status === 'SUBSCRIBED' && presence === channel) void channel.track({ changed: Date.now() });
    });
}

async function request(action, payload) {
  if (!userId || busy || deletionPage) return false;
  const mutation = action !== 'state';
  if (!mutation && stateRequest) return false;
  if (mutation) { busy = true; revision++; }
  const read = {};
  if (!mutation) { stateRequest = read; lastRead = performance.now(); }
  const version = revision;
  try {
    const result = await invokeLibrary(client, action, payload);
    if (version !== revision || (data && result.now < data.now)) return false;
    if (data?.session?.state !== result.session?.state && result.session?.state === 'completed') toast('Periyot tamamlandı.');
    if (data?.session?.state !== result.session?.state && result.session?.state === 'invalid') toast('Bu periyot geçersiz sayıldı.');
    data = result;
    clock = markServerTime(result.now);
    refreshing = false;
    syncPresence();
    const incoming = (result.reactions ?? []).filter(event => !seenReactions.has(event.id));
    for (const event of incoming) seenReactions.add(event.id);
    if (seenReactions.size > 128) for (const id of [...seenReactions].slice(0, 64)) seenReactions.delete(id);
    if (incoming.length) toast(incoming.map(event => `${reactionArt[event.kind]} ${event.name}`).join(' · '));
    if (result.drop) toast('Sandık ödülü · ' + (result.drop.item
      ? result.items.find(item => item.id === result.drop.item)?.name ?? result.drop.item
      : result.drop.coins + ' jeton'));
    if (['status', 'start', 'target', 'place', 'react'].includes(action)) void presence?.track({ changed: result.now });
    return true;
  } catch (error) {
    if (version === revision && (mutation || !data)) toast(messageFor(error.message));
    return false;
  } finally {
    if (stateRequest === read) stateRequest = undefined;
    if (version === revision) {
      if (mutation) busy = false;
      render();
    }
  }
}

function reflectSession(next) {
  const id = next?.user?.id;
  if (id === userId && lastView !== undefined) return;
  revision++;
  userId = id;
  data = clock = ranking = rankingRequest = undefined;
  busy = refreshing = editing = false;
  avatar = { ...baseAvatar };
  draft.target = null;
  draft.roomName = draft.invite = '';
  stateRequest = undefined;
  lastRead = 0;
  lastView = lastScene = undefined;
  seenReactions.clear();
  if (!id) emailSent = false;
  syncPresence();
  render();
  if (id && !deletionPage) void request('state');
}

function signInView() {
  if (!client) return '<section class="card account-card"><h1>Sanal Kütüphane</h1><p>Web istemcisinin Supabase bağlantısı henüz ayarlanmadı.</p></section>';
  return `<section class="card account-card">
    <h1>${deletionPage ? 'Hesabımı ve Verilerimi Sil' : 'Kütüphaneye giriş'}</h1>
    <p>${deletionPage ? 'Silmek istediğin Supabase hesabıyla giriş yap.' : 'Web ve mobilde aynı hesabı kullan.'}</p>
    <form id="email-form" class="stacked">
      <label class="field">E-posta <input type="email" name="email" required autocomplete="email" value="${escape(draft.email)}"></label>
      <button class="primary">${emailSent ? 'Yeni giriş e-postası gönder' : 'Giriş e-postası gönder'}</button>
    </form>
    ${emailSent ? `<p>E-postandaki bağlantıyı bu tarayıcıda aç. E-posta bir kod içeriyorsa aşağıya yazabilirsin.</p>
    <form id="code-form" class="stacked"><label class="field">E-posta kodu <input name="code" required
      inputmode="numeric" pattern="[0-9]{6,10}" autocomplete="one-time-code"></label><button class="secondary">Kodu doğrula</button></form>` : ''}
    ${config.google ? '<button class="secondary" data-action="oauth" data-value="google">Google ile giriş</button>' : ''}
    ${config.apple ? '<button class="secondary" data-action="oauth" data-value="apple">Apple ile giriş</button>' : ''}
    <a href="${deletionPage ? '/' : '/account-deletion'}">${deletionPage ? 'Kütüphaneye dön' : 'Hesabı silme sayfası'}</a>
  </section>`;
}

function deletionView() {
  return '<section class="card account-card"><h1>Hesabımı ve Verilerimi Sil</h1><p>Profilin, envanterin, çalışma geçmişin ve hesabına bağlı kayıtlar kalıcı olarak silinir.</p><button class="primary" data-action="delete-account">Hesabımı ve Verilerimi Sil</button><a href="/">Kütüphaneye dön</a></section>';
}

function picker(name, label, value, choices) {
  const selected = choices.find(([choice]) => String(choice) === String(value));
  return `<div class="field"><span id="label-${name}">${label}</span><details class="picker" data-picker="${name}">
    <summary aria-labelledby="label-${name} value-${name}"><span id="value-${name}">${selected[1]}</span></summary>
    <div class="picker-options" role="group" aria-labelledby="label-${name}">${choices.map(([choice, text]) =>
      `<button type="button" data-choice="${choice}" aria-pressed="${String(choice) === String(value)}">${text}</button>`).join('')}</div>
  </details></div>`;
}

function pickerForHair() {
  return picker('hair', 'Saç', avatar.hair, hairStyles[avatar.gender].tr.map((label, index) => [index, label]));
}

function sprite(part, small = false) {
  return `<img alt="" class="sprite ${small ? 'small' : ''}" src="${portrait(part)}">`;
}

function deskItems(equipped, pet) {
  const light = deskLights.find(item => equipped.includes(item));
  return [
    light && `<span class="desk-prop desk-light desk-${light}"><img src="${propImage(light)}" alt=""></span>`,
    equipped.includes('plant') && `<span class="desk-prop desk-plant"><img src="${propImage('leaves')}" class="plant-leaves" alt=""><img src="${propImage('pot')}" alt=""></span>`,
    ...deskDecorations.filter(item => equipped.includes(item)).map(item =>
      `<span class="desk-prop desk-${item}"><img src="${propImage(item)}" alt=""></span>`),
    equipped.includes('cat') && `<span class="desk-prop desk-cat ${pet?.upset || pet?.xp > 0 ? 'pet-rest' : ''}">
      <img src="${propImage(pet?.upset ? 'catUpset' : pet?.xp > 0 ? 'catSleep' : 'cat')}" alt=""></span>`,
  ].filter(Boolean).join('');
}

function seat(member, index, [column, row]) {
  const atDesk = member?.status === 'desk';
  const name = member ? escape(member.name) + (member.own ? ' · Sen' : '') : 'Boş masa ' + (index + 1);
  const canReact = member?.desk_ref && !member.own && !running();
  return `<div class="seat ${member?.own ? 'own' : member ? '' : 'empty'}" style="grid-column:${column};grid-row:${row}">
    ${member ? `<span class="seat-status ${atDesk ? '' : 'break'}"><span class="dot"></span> ${atDesk ? 'Masada' : 'Molada'}</span>` : ''}
    <div class="chair"></div>
    ${member && atDesk ? sprite(dressedAvatar(member.avatar, member.placed), true) : ''}
    <div class="desktop" aria-hidden="true">
      ${atDesk ? `<span class="desk-writing" style="--writing-frames:${writingSize.frames}"><img src="${writingFrames()}" alt=""></span>` : '<span class="book"></span>'}
      ${member ? deskItems(member.placed, member.pet) : ''}
    </div>
    ${canReact ? `<button class="seat-name" data-action="select-desk" data-value="${escape(member.desk_ref)}" aria-label="${name} · Masa tepkisi">${name}</button>` : `<div class="seat-name">${name}</div>`}
    ${member?.target ? `<span class="seat-target">${escape(member.target)}</span>` : ''}
  </div>`;
}

function roomSeats() {
  const own = data.members.find(member => member.own);
  const others = data.members.filter(member => !member.own);
  const ring = [[1, 2], [3, 2], [2, 1], [2, 3], [1, 1], [3, 1], [1, 3], [3, 3]];
  return `<div class="seats">${seat(own, 4, [2, 2])}${ring.map((position, index) =>
    seat(others[index], (position[1] - 1) * 3 + position[0] - 1, position)).join('')}</div>`;
}

function roomView(room) {
  const name = escape(room?.name ?? data.rooms[0]?.name ?? 'Kütüphane');
  const paused = session() && !running();
  const controls = running()
    ? '<button class="primary" data-action="status" data-value="break">Ⅱ &nbsp; Molaya geç</button>'
    : paused && room
      ? '<button class="primary" data-action="status" data-value="desk">▶ &nbsp; Çalışmaya devam et</button><button class="secondary" data-action="abandon">Periyodu bırak</button>'
      : room
        ? `<div class="status-group"><button data-action="status" data-value="desk" aria-pressed="${data.profile.status === 'desk'}">▣ Masada</button><button data-action="status" data-value="break" aria-pressed="${data.profile.status === 'break'}">☕ Molada</button></div>${picker('duration', 'Periyot süresi', durationChoice, durationOptions)}
        ${durationChoice === 'custom' ? `<label class="field custom-duration">Dakika <input id="custom-duration" type="number" inputmode="numeric" min="5" max="180" step="1" value="${escape(customDuration)}"><small>5–180 dk</small></label>` : ''}
        <button class="primary" data-action="start" ${validDuration() ? '' : 'disabled'}>▶ &nbsp; Çalışmaya başla</button>`
        : '<a class="primary" href="#rooms">Bir odaya katıl</a>';
  return `<div class="heading"><h1>${name}</h1>${running() ? '' : '<a class="secondary" href="#rooms">Tüm odalar</a>'}</div>
  <section class="scene" data-room-theme="${roomPreferences.themeFor(room)}" aria-label="${name}">
  <div class="scene-top"><span><span class="dot"></span> <span id="room-count">${room?.count ?? 0}</span> / ${room?.capacity ?? 9} kişi</span><span>☾ &nbsp; Sessiz oda</span></div>
  <div id="room-seats">${roomSeats()}</div></section>
  <section class="controls"><div class="timer"><div class="timer-ring" id="timer-ring"><b id="timer">50:00</b></div><div>
  <h2>Odak periyodu</h2><p>${running() ? 'Çalışma sürüyor' : paused ? 'Molada · Sayaç duraklatıldı' : 'Her 20 dakikada bir doğrulama'}</p></div></div>
  <div class="control-actions">${controls}</div></section>
  ${room ? `<p class="room-meta">🌳 Kütüphane Ağacı · ${room.minutes ?? 0} dk${room.invite && !running() ? ` · Davet kodu <b>${escape(room.invite)}</b>` : ''}</p>` : ''}
  ${room && !running() ? roomPreferences.markup(room, data.inventory) : ''}`;
}

function roomsView() {
  return `<div class="heading"><h1>Odalar</h1><a class="secondary" href="#ranking">Haftalık sıralama</a></div>
  <div class="cards">${data.rooms.map(room => `<article class="card room-card">
    <span class="item-icon">${room.private ? '◆' : roomIcons[room.id] ?? '☾'}</span><h2>${escape(room.name)}</h2>
    ${room.targets?.length ? `<p>${escape(room.targets.join(' · '))}</p>` : ''}
    <p><span class="dot"></span> ${room.count} / ${room.capacity} kişi</p>
    <button class="primary" data-action="join" data-value="${escape(room.id)}" ${room.count >= room.capacity && data.profile?.room !== room.id ? 'disabled' : ''}>${data.profile?.room === room.id ? 'Odayı aç' : room.count >= room.capacity ? 'Oda dolu' : 'Odaya katıl'}</button>
  </article>`).join('')}</div>
  <div class="cards private-actions">
    <form class="card stacked" id="create-room-form"><label class="field">Özel oda adı <input name="roomName" value="${escape(draft.roomName)}" required minlength="2" maxlength="32"></label><button class="primary">10 jetonla oda aç</button></form>
    <form class="card stacked" id="join-room-form"><label class="field">Davet kodu <input name="invite" value="${escape(draft.invite)}" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6"></label><button class="secondary">Kodla katıl</button></form>
  </div>`;
}

function itemImage(item) {
  if (item.kind === 'wearable' || item.kind === 'hair') return sprite(dressedAvatar(data.profile.avatar, [item.id]));
  if (item.id === 'plant') return `<span class="catalog-plant"><img src="${propImage('leaves')}" alt=""><img src="${propImage('pot')}" alt=""></span>`;
  const prop = item.id === 'cat' ? 'catSleep' : item.id;
  return hasPropArt(prop) ? `<img src="${propImage(prop)}" alt="">` : itemIcons[item.id] ?? '✦';
}

function catalog(inventoryOnly) {
  const visible = inventoryOnly ? data.items.filter(item => data.inventory.some(owned => owned.item === item.id)) : data.items;
  if (!visible.length) return '<p class="empty-message">Envanterin boş.</p>';
  return `<div class="cards">${visible.map(item => {
    const owned = data.inventory.find(entry => entry.item === item.id);
    const rare = item.kind === 'rare';
    const label = item.kind === 'hair' || item.kind === 'wearable' ? 'Kuşan' : 'Kullan';
    return `<article class="card ${rare ? 'rare-card' : ''}"><span class="item-icon item-preview">${itemImage(item)}</span>
      <h2>${escape(item.name)}</h2>${rare ? '<p>Sandık hediyesi</p>' : ''}
      ${inventoryOnly ? item.kind === 'ambience' ? '<p>Ses paketi</p>' :
        `<button class="secondary" data-action="place" data-value="${escape(item.id)}">${owned.placed ? '✓ Kullanılıyor · Çıkar' : label}</button>`
        : rare ? '' : `<button class="primary" data-action="buy" data-value="${escape(item.id)}"
        ${owned || data.profile.coins < item.price ? 'disabled' : ''}>${owned ? 'Envanterinde' : '◉ ' + item.price + ' jeton'}</button>`}
    </article>`;
  }).join('')}</div>`;
}

function profileView() {
  const profile = data.profile;
  const name = escape(profile?.name);
  return `<div class="heading"><h1>${profile ? 'Profil ve Envanter' : 'Avatarını oluştur'}</h1></div>
  <section class="profile-card">${sprite(editing || !profile ? avatar : dressedAvatar(profile.avatar, placed()))}
  ${editing || !profile ? `<form id="avatar-form"><label>Kullanıcı adı<input name="name" value="${name}" minlength="2" maxlength="24" required></label>
  <div class="form-options">${picker('gender', 'Cinsiyet', avatar.gender, genders)}${pickerForHair()}
    ${picker('outfit', 'Kıyafet', avatar.outfit, ['Kazak', 'Tişört', 'Hırka'].map((text, index) => [index, text]))}
    ${picker('color', 'Renk', avatar.color, ['Tarçın', 'Adaçayı', 'Gece mavisi', 'Kahve'].map((text, index) => [palette[index], text]))}
  </div><button class="primary">Avatarı kaydet</button></form>` : `<div><h2>${name}</h2>
    ${profile.target ? `<p>${escape(profile.target)}</p>` : ''}
    <button class="secondary" data-action="edit">Avatarı düzenle</button>
    ${profile.room ? '<button class="secondary" data-action="leave">Odadan ayrıl</button>' : ''}</div>`}</section>
  ${profile ? `<form id="target-form" class="card stacked private-actions"><label class="field">Ne çalışıyorsun?
    <input name="target" maxlength="48" value="${escape(draft.target ?? profile.target)}"></label><button class="secondary">Hedefi kaydet</button></form>
    <div class="toolbar"><button class="secondary" data-action="study-card">Çalışma kartını indir</button>
    <a class="secondary" href="#ranking">Haftalık sıralama</a></div>
    <h2 class="section-title">Envanter</h2>${catalog(true)}` : ''}
  <div class="toolbar"><button class="secondary" data-action="sign-out">Çıkış yap</button>
  <a class="secondary" href="/account-deletion">Hesabımı ve Verilerimi Sil</a></div>`;
}

function shopView() {
  return `<div class="heading"><h1>Mağaza</h1></div>
  <div class="toolbar"><button class="primary" data-action="openBox" ${data.profile.coins < 50 ? 'disabled' : ''}>Gizem Kutusu · 50 jeton</button>
  <button class="secondary" data-action="openChest" ${!data.chests ? 'disabled' : ''}>Oda sandığı · ${data.chests ?? 0}</button></div>${catalog(false)}`;
}

function rankingView() {
  const header = '<div class="heading"><h1>Haftalık sıralama</h1></div>';
  if (!ranking) return header + '<p>Yükleniyor…</p>';
  if (ranking.error) return `${header}<p>${escape(ranking.error)}</p><button class="secondary" data-action="ranking-retry">Tekrar dene</button>`;
  return `${header}<section class="card">
    <p>${escape(ranking.starts)} – ${escape(ranking.ends)} · İstanbul saati</p>
    <p>Sıralamaya katılırsan görünen adın ve doğrulanmış çalışma dakikan paylaşılır.</p>
    <button class="secondary" data-action="rankingVisibility" data-value="${!ranking.visible}">${ranking.visible ? 'Sıralamadan ayrıl' : 'Sıralamaya katıl'}</button>
    ${ranking.own ? `<p>Sıran <b>${ranking.own.rank}</b> · ${ranking.own.minutes} dk</p>` : ''}
    ${ranking.rows.length ? `<ol class="ranking-list">${ranking.rows.map(row => `<li><span>${row.rank} · ${escape(row.name)}</span><b>${row.minutes} dk</b></li>`).join('')}</ol>`
      : '<p>Bu hafta listede henüz kimse yok.</p>'}
  </section>`;
}

function loadRanking() {
  if (rankingRequest) return rankingRequest;
  const id = userId;
  rankingRequest = invokeLibrary(client, 'leaderboard').then(
    result => { if (id === userId) ranking = result; },
    error => { if (id === userId) ranking = { error: messageFor(error.message) }; },
  ).finally(() => {
    if (id === userId) { rankingRequest = null; render(); }
  });
  return rankingRequest;
}

function paint(view, signature, html) {
  if (signature === lastView) return;
  if (!(view === 'profile' && lastView?.startsWith('["profile",') && document.querySelector('#avatar-form') && (editing || !data.profile))) {
    content.innerHTML = html();
  }
  lastView = signature;
  lastScene = undefined;
}

function render() {
  const page = location.hash.slice(1);
  const lock = running();
  const sidebar = document.querySelector('.sidebar');
  sidebar.inert = lock || !userId || deletionPage;
  document.body.classList.toggle('focusing', lock);
  document.querySelector('#balance').textContent = data?.profile?.coins ?? 0;
  if (!userId || deletionPage || !data) {
    roomPreferences.sync(null);
    if (verification.open) verification.close();
    const signIn = !userId;
    document.querySelector('#location').textContent = signIn ? 'Giriş' : deletionPage ? 'Hesap silme' : 'Kütüphane';
    paint('', JSON.stringify([signIn, deletionPage, emailSent, Boolean(data)]),
      signIn ? signInView : deletionPage ? deletionView : () => '<p>Yükleniyor…</p>');
    return;
  }
  const view = !data.profile ? 'profile' : lock ? 'room' : Object.hasOwn(labels, page) ? page : 'room';
  if (lock && page !== 'room') history.replaceState(null, '', '#room');
  document.querySelector('#location').textContent = labels[view];
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if ((view !== 'room' || lock) && reactionDialog.open) reactionDialog.close();
  const room = data.rooms.find(item => item.id === data.profile?.room);
  const signature = JSON.stringify([view, view === 'room'
    ? [room?.id, room?.minutes, room?.invite, data.profile?.status, data.session, durationChoice, data.inventory]
    : view === 'rooms' ? data.rooms : view === 'ranking' ? ranking
      : [data.profile, data.inventory, data.items, view === 'shop' && data.chests], editing]);
  paint(view, signature, () => view === 'room' ? roomView(room) : view === 'rooms' ? roomsView()
    : view === 'profile' ? profileView() : view === 'ranking' ? rankingView() : shopView());
  roomPreferences.sync(view === 'room' ? room : null, data.inventory);
  if (view === 'ranking' && !ranking) void loadRanking();
  if (view === 'room') {
    const count = room?.count ?? 0;
    const sceneSignature = JSON.stringify([count, data.members]);
    if (lastScene !== sceneSignature) {
      document.querySelector('#room-count').textContent = count;
      document.querySelector('#room-seats').innerHTML = roomSeats();
      lastScene = sceneSignature;
    }
  }
  updateClock();
}

const format = seconds => [Math.floor(seconds / 60), seconds % 60].map(part => String(part).padStart(2, '0')).join(':');

function updateClock() {
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
    document.querySelector('#verify-time').textContent = Math.ceil(remainingCheck / 1000) + ' sn';
    verification.querySelector('[data-value="break"]').disabled = !running() || pendingPauseAt !== undefined;
    if (!verification.open) verification.showModal();
  } else if (verification.open) verification.close();
}

function redirectTo() {
  return location.origin + (deletionPage ? '/account-deletion' : '/');
}

verification.addEventListener('cancel', event => event.preventDefault());
document.addEventListener('input', event => {
  const field = event.target;
  if (field.id === 'custom-duration') {
    customDuration = field.value;
    document.querySelector('[data-action="start"]').disabled = !validDuration();
    updateClock();
  }
  if (Object.hasOwn(draft, field.name)) draft[field.name] = field.value;
});

document.addEventListener('click', event => {
  const option = event.target.closest('[data-choice]');
  const picker = event.target.closest('.picker');
  document.querySelectorAll('.picker[open]').forEach(open => { if (open !== picker) open.open = false; });
  if (!option || !picker) return;
  const name = picker.dataset.picker;
  const value = option.dataset.choice;
  picker.open = false;
  if (name === 'duration') {
    durationChoice = value;
    render();
    document.querySelector(value === 'custom' ? '#custom-duration' : '[data-picker="duration"] summary')?.focus();
    return;
  }
  avatar[name] = name === 'hair' || name === 'outfit' ? Number(value) : value;
  if (name === 'gender') document.querySelector('[data-picker="hair"]').closest('.field').outerHTML = pickerForHair();
  picker.querySelector('summary span').textContent = option.textContent;
  picker.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === option)));
  picker.querySelector('summary').focus();
  document.querySelector('.profile-card .sprite').outerHTML = sprite(avatar);
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
  if (!['email-form', 'code-form', 'avatar-form', 'target-form', 'create-room-form', 'join-room-form'].includes(form.id)) return;
  event.preventDefault();
  if (busy || !client) return;
  const fields = new FormData(form);
  if (form.id === 'email-form' || form.id === 'code-form') {
    const button = form.querySelector('button');
    busy = button.disabled = true;
    try {
      if (form.id === 'email-form') {
        draft.email = fields.get('email').trim();
        const { error } = await client.auth.signInWithOtp({ email: draft.email, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        emailSent = true;
        render();
        toast('Giriş e-postanı kontrol et.');
      } else {
        const { error } = await client.auth.verifyOtp({ email: draft.email, token: fields.get('code').trim(), type: 'email' });
        if (error) throw error;
      }
    } catch { toast('Giriş tamamlanamadı. E-postanı kontrol edip tekrar dene.'); }
    finally { busy = button.disabled = false; }
    return;
  }
  if (form.id === 'avatar-form') {
    const wasEditing = editing;
    if (await request('profile', { ...avatar, name: fields.get('name') })) {
      editing = false;
      lastView = undefined;
      if (!wasEditing) location.hash = 'rooms';
      render();
    }
  } else if (form.id === 'target-form') {
    if (await request('target', { target: fields.get('target') })) draft.target = null;
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
  if (action === 'oauth' && client) {
    const { error } = await client.auth.signInWithOAuth({ provider: value, options: { redirectTo: redirectTo() } });
    if (error) toast('Giriş tamamlanamadı.');
    return;
  }
  if (!userId) return;
  if (action === 'sign-out' || action === 'delete-account') {
    if (action === 'delete-account' && !confirm('Hesabın ve verilerin kalıcı olarak silinsin mi?')) return;
    busy = button.disabled = true;
    try {
      if (action === 'delete-account') await invokeLibrary(client, 'deleteAccount');
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error && action !== 'delete-account') throw error;
      reflectSession(null);
      toast(action === 'delete-account' ? 'Hesabın ve verilerin silindi.' : 'Oturum kapatıldı.');
    } catch (error) { toast(messageFor(error.message)); }
    finally { busy = button.disabled = false; }
    return;
  }
  if (!data?.profile || (running() && action !== 'verify' && !(action === 'status' && value === 'break'))) return;
  if (action === 'edit') {
    avatar = { ...data.profile.avatar };
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
      await downloadStudyCard(summary, { ...data.profile, avatar: dressedAvatar(data.profile.avatar, placed()) });
    } catch { toast('Çalışma kartı hazırlanamadı.'); }
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
  if (action === 'abandon' && !confirm('Bu periyottan jeton kazanamayacaksın. Periyodu bırakmak istiyor musun?')) return;
  const payload = {
    join: { room: value }, status: { status: value }, start: { duration: duration() },
    buy: { item: value }, place: { item: value }, react: { desk: selectedDesk?.desk_ref, kind: value },
    rankingVisibility: { visible: value === 'true' },
  };
  const pausing = running() && action === 'status' && value === 'break';
  if (pausing) { pendingPauseAt = now(); updateClock(); }
  const success = await request(action, payload[action]);
  if (pausing) { pendingPauseAt = undefined; updateClock(); }
  if (success) {
    if (action === 'join') location.hash = 'room';
    if (action === 'leave') location.hash = 'rooms';
    if (action === 'buy') toast('Eşya envanterine eklendi.');
    if (action === 'react') { reactionDialog.close(); toast('Tepki gönderildi.'); }
    if (action === 'rankingVisibility') { ranking = undefined; render(); }
  }
});

roomPreferences.attach(document, () => busy || running());
window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && userId) { refreshing = true; updateClock(); void request('state'); }
});
if (client) {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url);
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) toast('Giriş bağlantısı kullanılamadı. Bu tarayıcıda yeni bir giriş e-postası iste.');
  }
  const { data: auth } = await client.auth.getSession();
  reflectSession(auth.session);
  client.auth.onAuthStateChange((_event, updated) => setTimeout(() => reflectSession(updated), 0));
} else render();
setInterval(() => {
  if (!document.hidden && (data?.profile?.room || session() || performance.now() - lastRead >= 5000)) void request('state');
}, 1000);
setInterval(updateClock, 200);
