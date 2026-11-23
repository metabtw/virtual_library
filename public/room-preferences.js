import { webText } from './web-strings.js';
import { roomGoalMinutes } from './study-rewards.js';

const preferenceKey = 'library-room-preferences';

const themes = {
  auto: 'themeAuto', classic: 'themeClassic', rain: 'themeRain',
  garden: 'themeGarden', stars: 'themeStars',
};

const themeImages = {
  classic: '/library.webp', rain: '/room-themes/rain.webp', garden: '/room-themes/garden.webp',
  stars: '/room-themes/stars.webp', aurora: '/aurora.webp',
};

const tracks = {
  rain: 'rain', fire: 'fire', cafe: 'cafe', lofi: 'lofi', space: 'space', forest: 'forest',
};

const levels = ['audioOff', 'audioLow', 'audioMid', 'audioHigh'];
const isLevel = level => Number.isInteger(level) && level >= 0 && level < levels.length;
const isAvailable = (track, inventory) => !['space', 'forest'].includes(track) || inventory.some(entry => entry.item === track);

export function resolveRoomTheme(choice, room) {
  if (choice !== 'auto') return choice;
  if ((room?.minutes ?? 0) >= roomGoalMinutes) return 'aurora';
  if (room?.id === 'rain-terrace') return 'rain';
  if (room?.id === 'aurora-observatory') return 'aurora';
  if (room?.id === 'japanese-garden' || room?.id === 'garden') return 'garden';
  if (room?.id === 'archive') return 'stars';
  return 'classic';
}

function readPreferences(storage) {
  try {
    return JSON.parse(storage()?.getItem(preferenceKey)) ?? {};
  } catch {
    return {};
  }
}

export function createRoomPreferences({
  storage = () => localStorage, createAudio = url => new Audio(url), translate = key => webText('tr', key),
} = {}) {
  const saved = readPreferences(storage);
  let theme = Object.hasOwn(themes, saved.theme) ? saved.theme : 'auto';
  const volumes = Object.fromEntries(Object.keys(tracks).map(track => [track,
    isLevel(saved.volumes?.[track]) ? saved.volumes[track] : 0]));
  const players = new Map();
  const blocked = new Set();
  const attempts = new Map();
  let scope;
  let activeRoom;
  let inventory = [];
  let playbackKey;

  const themeFor = room => resolveRoomTheme(theme, room);
  const trackLevel = track => activeRoom && isAvailable(track, inventory) ? volumes[track] : 0;

  function save() {
    try { storage()?.setItem(preferenceKey, JSON.stringify({ theme, volumes })); }
    catch { /* Keep this tab's choices when storage is unavailable. */ }
  }

  function showPlaybackStatus() {
    const notice = scope?.querySelector('[data-ambience-notice]');
    const play = scope?.querySelector('[data-play-ambience]');
    if (notice) notice.textContent = blocked.size ? translate('soundStopped') : '';
    if (play) play.hidden = blocked.size === 0;
  }

  function applyPlayback(retry = false) {
    for (const track of Object.keys(tracks)) {
      const level = trackLevel(track);
      let player = players.get(track);
      if (!level) {
        attempts.delete(track);
        blocked.delete(track);
        player?.pause();
        continue;
      }
      if (!player) {
        player = createAudio(`/room-ambience/${track}.m4a`);
        player.loop = true;
        players.set(track, player);
      }
      player.volume = level * 0.16;
      if (!player.paused || (blocked.has(track) && !retry)) continue;
      const attempt = {};
      attempts.set(track, attempt);
      blocked.delete(track);
      void Promise.resolve(player.play()).catch(() => {
        if (attempts.get(track) !== attempt) return;
        blocked.add(track);
        showPlaybackStatus();
      });
    }
    showPlaybackStatus();
  }

  function sync(room, items = []) {
    activeRoom = room;
    inventory = items;
    const nextKey = Object.keys(tracks).map(trackLevel).join('');
    if (nextKey === playbackKey) {
      showPlaybackStatus();
      return;
    }
    playbackKey = nextKey;
    applyPlayback();
  }

  function markup(room, items) {
    const themeOptions = Object.entries(themes).map(([choice, label]) =>
      `<button type="button" data-room-theme-choice="${choice}" aria-pressed="${theme === choice}"><img src="${themeImages[resolveRoomTheme(choice, room)]}" alt="" width="70" height="38" loading="lazy">${translate(label)}</button>`).join('');
    const mix = Object.entries(tracks).map(([track, label]) => isAvailable(track, items)
      ? `<fieldset class="ambience-track"><legend>${translate(label)}</legend><div class="ambience-levels">${levels.map((name, level) =>
        `<label><input type="radio" name="ambience-${track}" data-ambience-track="${track}" value="${level}" ${volumes[track] === level ? 'checked' : ''}><span>${translate(name)}</span></label>`).join('')}</div></fieldset>`
      : `<p class="ambience-locked">${translate(label)} · ${translate('audioLocked')}</p>`).join('');
    return `<div class="room-preferences">
      <details class="room-preference room-theme"><summary><span>${translate('themeTitle')}</span><span data-current-room-theme>${translate(themes[theme])}</span></summary><div class="room-theme-options">${themeOptions}</div></details>
      <details class="room-preference room-ambience"><summary>${translate('ambience')}</summary><div class="room-ambience-controls">${mix}
      <p data-ambience-notice role="status"></p><button type="button" class="secondary" data-play-ambience hidden>${translate('soundPlay')}</button></div></details>
    </div>`;
  }

  function attach(document, isLocked) {
    scope = document;
    document.addEventListener('click', event => {
      if (!activeRoom || isLocked()) return;
      const choice = event.target.closest('[data-room-theme-choice]');
      if (choice && Object.hasOwn(themes, choice.dataset.roomThemeChoice)) {
        theme = choice.dataset.roomThemeChoice;
        save();
        document.querySelector('.scene[data-room-theme]').dataset.roomTheme = themeFor(activeRoom);
        const picker = choice.closest('.room-theme');
        for (const option of picker.querySelectorAll('[data-room-theme-choice]')) {
          option.setAttribute('aria-pressed', String(option === choice));
        }
        picker.querySelector('[data-current-room-theme]').textContent = translate(themes[theme]);
        picker.open = false;
        picker.querySelector('summary').focus();
      }
      if (event.target.closest('[data-play-ambience]')) applyPlayback(true);
    });
    document.addEventListener('change', event => {
      const { target } = event;
      const track = target.dataset?.ambienceTrack;
      const level = Number(target.value);
      if (!activeRoom || isLocked() || !target.checked || !Object.hasOwn(tracks, track) || !isLevel(level)
        || !isAvailable(track, inventory)) return;
      volumes[track] = level;
      save();
      playbackKey = Object.keys(tracks).map(trackLevel).join('');
      applyPlayback(true);
    });
  }

  return { attach, markup, sync, themeFor };
}
