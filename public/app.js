const content = document.querySelector('#content');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#verify-dialog');
const labels = { room: 'Kütüphane', rooms: 'Odalar', shop: 'Mağaza', profile: 'Profil & Envanter' };
const palette = ['#bd7050', '#789078', '#7988ab', '#ad7963'];
let data;
let revision = 0;
let busy = false;
let offset = 0;
let duration = 50;
let avatar = { hair: 0, outfit: 0, color: palette[0] };
let editing = false;
let lastView;
let noticeTimeout;

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

function sprite(part, small = false) {
  return `<div aria-hidden="true" class="sprite ${small ? 'small' : ''} hair-${part.hair} outfit-${part.outfit}" style="--shirt:${part.color}"><span class="body"></span><span class="face"><i></i></span><span class="hair"></span></div>`;
}

function seat(member, index) {
  const onBreak = member?.status === 'break';
  return `<div class="seat ${member ? '' : 'empty'}">
    ${member ? `<span class="seat-status ${onBreak ? 'break' : ''}"><span class="dot"></span> ${onBreak ? 'Molada' : 'Masada'}</span>` : ''}
    <div class="chair"></div>
    ${member && !onBreak ? sprite(member.placed.includes('sweater') ? { ...member.avatar, outfit: 0, color: '#d88b47' } : member.avatar, true) : ''}
    <div class="desktop"><span>${member && !onBreak ? '▰' : '▤'}</span><span>${member ? member.placed.filter(id => id !== 'sweater').map(id => data.items.find(item => item.id === id).icon).join(' ') || '☕' : ''}</span></div>
    <div class="seat-name">${member ? escape(member.name) + (member.own ? ' · Sen' : '') : 'Boş masa ' + (index + 1)}</div>
  </div>`;
}

function roomView() {
  const room = data.rooms.find(item => item.id === data.profile?.room);
  const name = room?.name || data.rooms[0].name;
  const active = data.session?.state === 'active';
  const count = room?.count || 0;
  return `<div class="heading"><div><p class="eyebrow">☾ &nbsp; ORTAK ÇALIŞMA ALANI</p><h1>${name}</h1><p>Bir masa seç, çalışma süreni ayarla ve birlikte odaklan.</p></div><a class="secondary" href="#rooms">Tüm odalar <span>↗</span></a></div>
  <section class="scene" aria-label="${name}"><div class="scene-top"><span><span class="dot"></span> ${count} / 12 kişi</span><span>☾ &nbsp; Sessiz oda</span></div><div class="seats">${Array.from({ length: Math.max(6, data.members.length) }, (_, index) => seat(data.members[index], index)).join('')}</div></section>
  <section class="controls"><div class="timer"><div class="timer-ring" id="timer-ring"><b id="timer">50:00</b></div><div><h2>Odak periyodu</h2><p>${active ? 'Çalışma sürüyor' : 'Her 20 dakikada bir doğrulama'}</p></div></div>
  <div class="control-actions">${room ? `<div class="status-group"><button data-action="status" data-value="desk" aria-pressed="${data.profile.status === 'desk'}">▣ Masada</button><button data-action="status" data-value="break" aria-pressed="${data.profile.status === 'break'}">☕ Molada</button></div><label class="sr-only" for="duration">Periyot süresi</label><select id="duration" ${active ? 'disabled' : ''}>${[25, 50, 90].map(option => `<option value="${option}" ${duration === option ? 'selected' : ''}>${option} dk</option>`).join('')}</select><button class="primary" data-action="start" ${active ? 'disabled' : ''}>▶ &nbsp; ${active ? 'Çalışma sürüyor' : 'Çalışmaya başla'}</button>` : `<button class="primary" data-action="join" data-value="night">Gece Kuşları odasına katıl →</button>`}</div></section>`;
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
  <div class="form-options"><label>Saç<select name="hair">${['Kısa', 'Kaküllü', 'Topuz'].map((label, index) => `<option value="${index}" ${avatar.hair === index ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
  <label>Kıyafet<select name="outfit">${['Kazak', 'Tişört', 'Hırka'].map((label, index) => `<option value="${index}" ${avatar.outfit === index ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
  <label>Renk<select name="color">${['Tarçın', 'Adaçayı', 'Gece mavisi', 'Kahve'].map((label, index) => `<option value="${palette[index]}" ${avatar.color === palette[index] ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><button class="primary">Avatarı kaydet</button></form>` : `<div><h2>${name}</h2><p>${profile.status === 'desk' ? 'Masada' : 'Molada'}</p><button class="secondary" data-action="edit">Avatarı düzenle</button>${profile.room ? ' <button class="secondary" data-action="leave">Odadan ayrıl</button>' : ''}</div>`}</section>
  ${profile ? '<h2 class="section-title">Envanter</h2>' + catalog(true) : ''}`;
}

function render() {
  if (!data) return;
  const page = location.hash.slice(1);
  const view = Object.hasOwn(labels, page) ? page : 'room';
  document.querySelector('#location').textContent = labels[view];
  document.querySelector('#balance').textContent = data.profile?.coins ?? 0;
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const { now, ...snapshot } = data;
  const signature = JSON.stringify([view, snapshot, editing]);
  if (lastView !== signature) {
    if (!(view === 'profile' && lastView?.startsWith('["profile",') && document.querySelector('#avatar-form') && (editing || !data.profile))) {
      content.innerHTML = view === 'room' ? roomView() : view === 'rooms' ? roomsView() : view === 'profile' ? profileView() :
        `<div class="heading"><div><p class="eyebrow">♧ &nbsp; KÜTÜPHANE MAĞAZASI</p><h1>Mağaza</h1><p>Jetonlarını avatarın ve masan için harca.</p></div></div>${catalog(false)}`;
    }
    lastView = signature;
  }
  updateClock();
}

const format = (seconds) => [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');

function updateClock() {
  const session = data?.session;
  const now = Date.now() + offset;
  const active = session?.state === 'active';
  const seconds = active ? Math.max(0, Math.ceil((session.end - now) / 1000)) : duration * 60;
  const timer = document.querySelector('#timer');
  if (timer) {
    timer.textContent = format(seconds);
    document.querySelector('#timer-ring').style.setProperty('--progress', active ? Math.max(0, Math.min(1, (session.end - now) / (session.end - session.start))) : 1);
  }
  const next = active && session.start + 1_200_000 * (session.checks + 1);
  const remaining = next + 30_000 - now;
  if (next && next < session.end && now >= next && remaining > 0) {
    document.querySelector('#verify-time').textContent = Math.ceil(remaining / 1000) + ' sn';
    if (!dialog.open) dialog.showModal();
  } else if (dialog.open) dialog.close();
}

dialog.addEventListener('cancel', event => event.preventDefault());
document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'duration') {
    duration = Number(target.value);
    updateClock();
  }
  if (target.matches('#avatar-form select')) {
    avatar[target.name] = target.name === 'color' ? target.value : Number(target.value);
    document.querySelector('.profile-card .sprite').outerHTML = sprite(avatar);
  }
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
  const payload = { join: { room: value }, status: { status: value }, start: { duration }, buy: { item: value }, place: { item: value } };
  if (await request(action, payload[action] || {})) {
    if (action === 'join') location.hash = 'room';
    if (action === 'leave') location.hash = 'rooms';
    if (action === 'buy') toast('Eşya envanterine eklendi.');
  }
});

window.addEventListener('hashchange', render);
await request('state');
setInterval(() => request('state'), 1000);
setInterval(updateClock, 200);
