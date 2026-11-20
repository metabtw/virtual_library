import { portrait } from './sprites.js';

const content = document.querySelector('#content');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#verify-dialog');
const labels = { room: 'Kütüphane', rooms: 'Odalar', shop: 'Mağaza', profile: 'Profil & Envanter' };
const palette = ['#bd7050', '#789078', '#7988ab', '#ad7963'];
let data;
let revision = 0;
let busy = false;
let offset = 0;
let durationChoice = '50';
let customDuration = '35';
const durationOptions = [['25', '25 dakika'], ['50', '50 dakika'], ['90', '90 dakika'], ['custom', 'Özel süre']];
const focusDuration = () => Number(durationChoice === 'custom' ? customDuration : durationChoice);
const validDuration = () => Number.isInteger(focusDuration()) && focusDuration() >= 5 && focusDuration() <= 180;
let lastScene;
let avatar = { hair: 0, outfit: 0, color: palette[0] };
let editing = false;
let lastView;
let noticeTimeout;
let pendingPauseAt;
const focusSession = () => data?.session?.state === 'active' ? data.session : null;
const isRunning = () => focusSession()?.paused_at === null;

const escape = (value) => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function toast(message) {
  notice.textContent = message;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { notice.textContent = ''; }, 4000);
}

async function request(action, body) {
  if (action === 'state' && busy) return;
  if (action !== 'state') {
    if (busy) return;
    busy = true;
    revision++;
  }
  const version = revision;
  try {
    const response = await fetch('/api/' + action, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : {});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (version !== revision || (data && result.now < data.now)) return;
    if (data && data.session?.state !== result.session?.state && result.session?.state === 'completed') toast('Periyot tamamlandı. Jetonların hesabına eklendi.');
    if (data && data.session?.state !== result.session?.state && result.session?.state === 'invalid') toast('Doğrulama kaçırıldı. Bu periyottan jeton kazanmadın.');
    data = result;
    offset = data.now - Date.now();
    return true;
  } catch (error) {
    if (action !== 'state' || !data) toast(error.message);
  } finally {
    if (action !== 'state') busy = false;
    render();
  }
}

function picker(name, label, value, choices) {
  const selected = choices.find(([choice]) => String(choice) === String(value));
  return `<div class="field"><span id="label-${name}">${label}</span><details class="picker" data-picker="${name}">
    <summary aria-labelledby="label-${name} value-${name}"><span id="value-${name}">${selected[1]}</span></summary>
    <div class="picker-options" role="group" aria-labelledby="label-${name}">${choices.map(([choice, text]) =>
      `<button type="button" data-choice="${choice}" aria-pressed="${String(choice) === String(value)}">${text}</button>`).join('')}</div>
  </details></div>`;
}

function sprite(part, small = false) {
  return `<img alt="" class="sprite ${small ? 'small' : ''}" src="${portrait(part)}">`;
}

function seat(member, index, [column, row]) {
  const onBreak = member?.status === 'break';
  return `<div class="seat ${member?.own ? 'own' : member ? '' : 'empty'}" style="grid-column:${column};grid-row:${row}">
    ${member ? `<span class="seat-status ${onBreak ? 'break' : ''}"><span class="dot"></span> ${onBreak ? 'Molada' : 'Masada'}</span>` : ''}
    <div class="chair"></div>
    ${member && !onBreak ? sprite(member.placed.includes('sweater') ? { ...member.avatar, outfit: 0, color: '#d88b47' } : member.avatar, true) : ''}
    <div class="desktop"><span class="${member && !onBreak ? 'laptop' : 'book'}" aria-hidden="true"></span><span>${member ? member.placed.filter(id => id !== 'sweater').map(id => data.items.find(item => item.id === id).icon).join(' ') || '☕' : ''}</span></div>
    <div class="seat-name">${member ? escape(member.name) + (member.own ? ' · Sen' : '') : 'Boş masa ' + (index + 1)}</div>
  </div>`;
}

function roomSeats() {
  const own = data.members.find(member => member.own);
  const others = data.members.filter(member => !member.own);
  const rows = others.length > 8 ? 5 : 3;
  const middle = (rows + 1) / 2;
  const ring = [[1, middle], [3, middle], [2, middle - 1], [2, middle + 1],
    [1, middle - 1], [3, middle - 1], [1, middle + 1], [3, middle + 1],
    [1, 1], [3, 1], [2, 5]];
  const sideSeats = Math.max(6, others.length);
  return `<div class="seats" style="--rows:${rows}">${seat(own, sideSeats, [2, middle])}${Array.from({length: sideSeats}, (_, index) =>
    seat(others[index], index, ring[index])).join('')}</div>`;
}

function roomView() {
  const room = data.rooms.find(item => item.id === data.profile?.room);
  const name = room?.name || data.rooms[0].name;
  const session = focusSession();
  const running = isRunning();
  const paused = session && !running;
  const controls = running
    ? '<button class="primary" data-action="status" data-value="break">Ⅱ &nbsp; Molaya geç</button>'
    : paused && room
      ? '<button class="primary" data-action="status" data-value="desk">▶ &nbsp; Çalışmaya devam et</button>'
      : room
        ? `<div class="status-group"><button data-action="status" data-value="desk" aria-pressed="${data.profile.status === 'desk'}">▣ Masada</button><button data-action="status" data-value="break" aria-pressed="${data.profile.status === 'break'}">☕ Molada</button></div>${picker('duration', 'Periyot süresi', durationChoice, durationOptions)}
        ${durationChoice === 'custom' ? `<label class="field custom-duration">Dakika <input id="custom-duration" type="number" inputmode="numeric" min="5" max="180" step="1" value="${customDuration}" aria-describedby="duration-range"><small id="duration-range">5–180 dk</small></label>` : ''}
        <button class="primary" data-action="start" ${validDuration() ? '' : 'disabled'}>▶ &nbsp; Çalışmaya başla</button>`
        : '<button class="primary" data-action="join" data-value="night">Gece Kuşları odasına katıl →</button>';
  const count = room?.count || 0;
  return `<div class="heading"><div><p class="eyebrow">☾ &nbsp; ORTAK ÇALIŞMA ALANI</p><h1>${name}</h1><p>Çalışma süreni ayarla ve birlikte odaklan.</p></div>${running ? '' : '<a class="secondary" href="#rooms">Tüm odalar <span>↗</span></a>'}</div>
  <section class="scene" aria-label="${name}"><div class="scene-top"><span><span class="dot"></span> <span id="room-count">${count}</span> / 12 kişi</span><span>☾ &nbsp; Sessiz oda</span></div><div id="room-seats">${roomSeats()}</div></section>
  <section class="controls"><div class="timer"><div class="timer-ring" id="timer-ring"><b id="timer">50:00</b></div><div><h2>Odak periyodu</h2><p>${running ? 'Çalışma sürüyor' : paused ? 'Molada · Sayaç duraklatıldı' : 'Her 20 dakikada bir doğrulama'}</p></div></div>
  <div class="control-actions">${controls}</div></section>`;
}

function roomsView() {
  return `<div class="heading"><div><p class="eyebrow">⌂ &nbsp; ÇALIŞMA ALANLARI</p><h1>Odalar</h1><p>Bir çalışma odası seç ve masanı al.</p></div></div><div class="cards">${data.rooms.map(room => `<article class="card room-card"><span class="item-icon">${room.icon}</span><h2>${room.name}</h2><p>${room.detail}</p><p><span class="dot"></span> ${room.count} / 12 kişi</p><button class="primary" data-action="join" data-value="${room.id}" ${room.count >= 12 && data.profile?.room !== room.id ? 'disabled' : ''}>${data.profile?.room === room.id ? 'Odayı aç' : room.count >= 12 ? 'Oda dolu' : 'Odaya katıl'}</button></article>`).join('')}</div>`;
}

function catalog(inventoryOnly) {
  const visible = inventoryOnly ? data.items.filter(item => data.inventory.some(owned => owned.item === item.id)) : data.items;
  if (!visible.length) return '<p class="empty-message">Envanterin boş. Odak periyotları tamamlayarak jeton kazanabilir ve mağazadan eşya alabilirsin.</p>';
  return `<div class="cards">${visible.map(item => {
    const owned = data.inventory.find(entry => entry.item === item.id);
    return `<article class="card"><span class="item-icon">${item.icon}</span><h2>${item.name}</h2><p>${item.detail}</p>
    ${inventoryOnly ? `<button class="secondary" data-action="place" data-value="${item.id}">${owned.placed ? '✓ Kullanılıyor · Çıkar' : 'Kullan'}</button>` : `<button class="primary" data-action="buy" data-value="${item.id}" ${owned ? 'disabled' : ''}>${owned ? 'Envanterinde' : '◉ ' + item.price + ' jeton'}</button>`}</article>`;
  }).join('')}</div>`;
}

function profileView() {
  const profile = data.profile;
  const name = profile ? escape(profile.name) : '';
  return `<div class="heading"><div><p class="eyebrow">♙ &nbsp; SENİN KÖŞEN</p><h1>${profile ? 'Profil ve Envanter' : 'Avatarını oluştur'}</h1><p>${profile ? 'Avatarını ve çalışma masanı kişiselleştir.' : 'Kütüphaneye katılmak için bir ad ve avatar seç.'}</p></div></div>
  <section class="profile-card">${sprite(editing || !profile ? avatar : profile.avatar)}${editing || !profile ? `<form id="avatar-form"><label>Kullanıcı adı<input name="name" value="${name}" minlength="2" maxlength="24" required placeholder="Örn. berk_aydin"></label>
  <div class="form-options">
    ${picker('hair', 'Saç', avatar.hair, ['Kısa', 'Kaküllü', 'Topuz'].map((text, index) => [index, text]))}
    ${picker('outfit', 'Kıyafet', avatar.outfit, ['Kazak', 'Tişört', 'Hırka'].map((text, index) => [index, text]))}
    ${picker('color', 'Renk', avatar.color, ['Tarçın', 'Adaçayı', 'Gece mavisi', 'Kahve'].map((text, index) => [palette[index], text]))}
  </div><button class="primary">Avatarı kaydet</button></form>` : `<div><h2>${name}</h2><p>${profile.status === 'desk' ? 'Masada' : 'Molada'}</p><button class="secondary" data-action="edit">Avatarı düzenle</button>${profile.room ? ' <button class="secondary" data-action="leave">Odadan ayrıl</button>' : ''}</div>`}</section>
  ${profile ? '<h2 class="section-title">Envanter</h2>' + catalog(true) : ''}`;
}

function render() {
  if (!data) return;
  const page = location.hash.slice(1);
  const running = isRunning();
  if (running && page && page !== 'room') history.replaceState(null, '', '#room');
  const view = !running && Object.hasOwn(labels, page) ? page : 'room';
  document.querySelector('.sidebar').inert = running;
  document.body.classList.toggle('focusing', running);
  document.querySelector('#location').textContent = labels[view];
  document.querySelector('#balance').textContent = data.profile?.coins ?? 0;
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const { now, ...snapshot } = data;
  const signature = JSON.stringify([view, view === 'room' ?
    [snapshot.profile?.room, snapshot.profile?.status, snapshot.session, durationChoice] : snapshot, editing]);
  if (lastView !== signature) {
    if (!(view === 'profile' && lastView?.startsWith('["profile",') && document.querySelector('#avatar-form') && (editing || !data.profile))) {
      content.innerHTML = view === 'room' ? roomView() : view === 'rooms' ? roomsView() : view === 'profile' ? profileView() :
        `<div class="heading"><div><p class="eyebrow">♧ &nbsp; KÜTÜPHANE MAĞAZASI</p><h1>Mağaza</h1><p>Jetonlarını avatarın ve masan için harca.</p></div></div>${catalog(false)}`;
    }
    lastView = signature;
    lastScene = null;
  }
  if (view === 'room') {
    const count = data.rooms.find(room => room.id === data.profile?.room)?.count ?? 0;
    const sceneSignature = JSON.stringify([count, data.members]);
    if (lastScene !== sceneSignature) {
      document.querySelector('#room-count').textContent = count;
      document.querySelector('#room-seats').innerHTML = roomSeats();
      lastScene = sceneSignature;
    }
  }
  updateClock();
}

const format = (seconds) => [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');

function updateClock() {
  const session = focusSession();
  const now = Date.now() + offset;
  const effectiveNow = session?.paused_at ?? pendingPauseAt ?? now;
  const seconds = session ? Math.max(0, Math.ceil((session.end - effectiveNow) / 1000)) : validDuration() ? focusDuration() * 60 : null;
  const timer = document.querySelector('#timer');
  if (timer) {
    timer.textContent = seconds === null ? '–:–' : format(seconds);
    document.querySelector('#timer-ring').style.setProperty('--progress', session ? Math.max(0, Math.min(1, (session.end - effectiveNow) / (session.end - session.start))) : 1);
  }
  const next = session?.verification_due ?? (isRunning() && session.start + 1_200_000 * (session.checks + 1));
  const remaining = next + 30_000 - now;
  if (next && next < session.end && now >= next && remaining > 0) {
    document.querySelector('#verify-time').textContent = Math.ceil(remaining / 1000) + ' sn';
    dialog.querySelector('[data-value="break"]').disabled = !isRunning() || pendingPauseAt !== undefined;
    if (!dialog.open) dialog.showModal();
  } else if (dialog.open) dialog.close();
}

dialog.addEventListener('cancel', event => event.preventDefault());
document.addEventListener('input', event => {
  if (event.target.id !== 'custom-duration') return;
  customDuration = event.target.value;
  document.querySelector('[data-action="start"]').disabled = !validDuration();
  updateClock();
});

document.addEventListener('click', event => {
  const picker = event.target.closest('.picker');
  document.querySelectorAll('.picker[open]').forEach(open => {
    if (open !== picker) open.open = false;
  });
  const option = event.target.closest('[data-choice]');
  if (!option || !picker) return;
  const name = picker.dataset.picker;
  const value = option.dataset.choice;
  picker.open = false;
  if (name === 'duration') {
    durationChoice = value;
    render();
    document.querySelector(value === 'custom' ? '#custom-duration' : '[data-picker="duration"] summary').focus();
    return;
  }
  avatar[name] = name === 'color' ? value : Number(value);
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
  if (event.target.id !== 'avatar-form') return;
  event.preventDefault();
  const name = new FormData(event.target).get('name');
  const wasEditing = editing;
  if (await request('profile', { ...avatar, name })) {
    editing = false;
    lastView = null;
    if (!wasEditing) location.hash = 'rooms';
    render();
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, value } = button.dataset;
  if (busy || (isRunning() && action !== 'verify' && !(action === 'status' && value === 'break'))) return;
  if (action === 'edit') {
    avatar = { ...data.profile.avatar };
    editing = true;
    render();
    return;
  }
  if (!data.profile) {
    location.hash = 'profile';
    toast('Katılmak için avatarını oluştur.');
    return;
  }
  if (action === 'join' && data.profile.room === value) {
    location.hash = 'room';
    return;
  }
  const payload = { join: { room: value }, status: { status: value }, start: { duration: focusDuration() }, buy: { item: value }, place: { item: value } };
  const pausing = isRunning() && action === 'status' && value === 'break';
  if (pausing) {
    pendingPauseAt = Date.now() + offset;
    updateClock();
  }
  const success = await request(action, payload[action] || {});
  if (pausing) {
    pendingPauseAt = undefined;
    updateClock();
  }
  if (success) {
    if (action === 'join') location.hash = 'room';
    if (action === 'leave') location.hash = 'rooms';
    if (action === 'buy') toast('Eşya envanterine eklendi.');
  }
});

window.addEventListener('hashchange', render);
await request('state');
setInterval(() => request('state'), 1000);
setInterval(updateClock, 200);
