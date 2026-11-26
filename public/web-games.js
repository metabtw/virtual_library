import { atlasColumns, atlasRows, createGameRound, gameArt } from './game-scenes.js';
import { roomBackdrop } from './room-art.js';
import { gameIds, gameText } from './study-games.js';

export const gameBackdropUrls = ['/library.webp', '/game-art.png', ...gameIds.map(id => roomBackdrop(gameArt[id].room))];

let stylesheet;
export function loadGameStyles() {
  stylesheet ??= new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/games.css';
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      link.remove();
      stylesheet = undefined;
      reject(new Error('Game styles unavailable'));
    }, { once: true });
    document.head.append(link);
  });
  return stylesheet;
}

const arrows = { left: '←', up: '↑', down: '↓', right: '→' };
const keys = { ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'right' };
const texture = index => `${(index % atlasColumns) * 100 / (atlasColumns - 1)}% ${Math.floor(index / atlasColumns) * 100 / (atlasRows - 1)}%`;
const artwork = index => `<span class="game-sprite" aria-hidden="true" style="background-position:${texture(index)}"></span>`;

export function mountGames(host, locale) {
  const t = gameText(locale);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  const { signal } = controller;
  let selected, round, ui, animation, lastFrame, swipe, flightKey;
  const sprites = new Map();
  host.insertAdjacentHTML('beforeend', `
    <div class="game-choices" aria-label="${host.querySelector('h1').textContent}">${gameIds.map(id => {
      const art = gameArt[id];
      return `<button class="game-choice" data-game="${id}" type="button"
         style="--game-image:url('${roomBackdrop(art.room)}');--game-edge:${art.edge};--game-ink:${art.accent}">
        <span class="game-choice-icon">${artwork(art.icon)}</span>
        <span><strong>${t.titles[id]}</strong><small>${t.chapters[id]}</small></span></button>`;
    }).join('')}</div>
    <section class="card game-card" aria-labelledby="game-title"></section>`);
  const panel = host.querySelector('.game-card');

  function choose(id) {
    cancelAnimationFrame(animation);
    lastFrame = swipe = flightKey = undefined;
    selected = id;
    round = createGameRound(id);
    sprites.clear();
    const art = gameArt[id];
    panel.style.setProperty('--game-edge', art.edge);
    panel.style.setProperty('--game-ink', art.accent);
    host.querySelectorAll('[data-game]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.game === id));
    });
    panel.innerHTML = `<div class="game-top">
      <h2 id="game-title">${t.titles[id]}</h2>
      <button class="secondary game-restart" type="button" data-game-restart>${t.restart}</button></div>
      <div class="game-console">
        <div class="game-arena game-${id}" tabindex="0" aria-label="${t.titles[id]}">
          <div class="game-backdrop" aria-hidden="true">
            <img class="game-room-art" alt="" src="${roomBackdrop(art.room)}" decoding="async">
          </div>
          ${id === 'merge' ? `<div class="game-board-grid" aria-hidden="true">${'<i></i>'.repeat(16)}</div>` : ''}
          ${id === 'tower' ? '<div class="game-guide-line" aria-hidden="true" hidden></div>' : ''}
          <div class="game-world"></div>
          <span class="game-precision" hidden>${t.aligned}</span>
          <div class="game-result" hidden><div>${artwork(art.icon)}
            <strong>${t.ended}</strong><button class="primary" type="button" data-game-restart>${t.restart}</button></div></div>
        </div>
        <aside class="game-instructions">
          <output class="game-hud"><span class="game-label">${id === 'tower' ? t.books : t.score}</span>
            <b data-game-score>0</b></output>
          ${id === 'glide' ? `<div class="game-impact">
            <span>${t.hits}</span><output data-impact-count>0/5</output>
            <div aria-hidden="true" class="game-impact-rings">${'<i></i>'.repeat(5)}</div></div>` : ''}
          <p>${t.help[id]}</p>
          <div class="game-actions" role="group" aria-label="${t.controls}">${id === 'merge'
            ? Object.entries(arrows).map(([direction, arrow]) =>
                `<button class="secondary" type="button" data-direction="${direction}" aria-label="${t.directions[direction]}">${arrow}</button>`).join('')
            : `<button class="primary" type="button" data-game-action>${id === 'tower' ? t.drop : t.start}</button>`}</div>
        </aside>
      </div>`;
    const arena = panel.querySelector('.game-arena');
    ui = {
      arena, world: arena.querySelector('.game-world'), backdrop: arena.querySelector('.game-backdrop'),
      guide: arena.querySelector('.game-guide-line'), precision: arena.querySelector('.game-precision'),
      end: arena.querySelector('.game-result'), score: panel.querySelector('[data-game-score]'),
      impact: panel.querySelector('[data-impact-count]'), rings: panel.querySelectorAll('.game-impact-rings i'),
      action: panel.querySelector('[data-game-action]'),
    };
    const backdrop = arena.querySelector('.game-room-art');
    const setFallback = () => { backdrop.hidden = true; };
    const restore = () => { backdrop.hidden = false; };
    backdrop.addEventListener('error', setFallback);
    backdrop.addEventListener('load', restore);
    if (backdrop.complete && !backdrop.naturalWidth) setFallback();
    paint();
    animation = requestAnimationFrame(frame);
  }

  function renderNode(node, order) {
    let sprite = sprites.get(node.key);
    if (!sprite) {
      const element = document.createElement('span');
      element.dataset.gamePiece = node.key;
      element.className = node.level ? 'game-node game-tile' : 'game-node game-piece';
      const face = document.createElement('span');
      face.className = 'game-sprite';
      element.append(face);
      if (node.level) element.append(document.createElement('span'));
      else element.setAttribute('aria-hidden', 'true');
      ui.world.append(element);
      sprite = { element, face };
      sprites.set(node.key, sprite);
    }
    const { element, face } = sprite;
    if (sprite.art !== node.art) {
      face.style.backgroundPosition = texture(node.art);
      sprite.art = node.art;
    }
    element.style.cssText = `--x:${node.x}cqw;--y:${node.y}cqh;width:${node.width}%;height:${node.height}%;
      transform:translate(var(--x),var(--y)) rotate(${node.rotate ?? 0}deg) scale(${node.scale ?? 1});
      opacity:${node.opacity ?? 1};z-index:${order};--tile-color:${node.color ?? ''};--tile-glow:${node.glow ?? 0}`;
    if (node.level && sprite.level !== node.level) {
      element.lastElementChild.textContent = t.items[Math.min(node.level, t.items.length - 1)];
      element.dataset.level = node.level;
      sprite.level = node.level;
    }
  }

  function paint() {
    const state = round.frame(reduceMotion.matches);
    const visible = new Set();
    state.nodes.forEach((node, order) => {
      visible.add(node.key);
      renderNode(node, order);
    });
    for (const [key, sprite] of sprites) {
      if (visible.has(key)) continue;
      sprite.element.remove();
      sprites.delete(key);
    }
    if (ui.guide) {
      ui.guide.hidden = !state.guide;
      if (state.guide) {
        const { x, y, width, height, aligned } = state.guide;
        ui.guide.style.cssText = `left:${x}%;top:${y}%;width:${width}%;height:${height}%;`;
        ui.guide.classList.toggle('aligned', aligned);
      }
    }
    ui.precision.hidden = !state.notice;
    ui.end.hidden = !state.done;
    if (ui.score.textContent !== String(state.score)) ui.score.textContent = state.score;
    if (ui.impact && ui.impact.textContent !== `${state.hits}/5`) {
      ui.impact.textContent = `${state.hits}/5`;
      ui.rings.forEach((ring, index) => ring.classList.toggle('spent', index < state.hits));
    }
    if (ui.action) {
      const label = selected === 'tower' ? t.drop : state.active ? t.lift : t.start;
      if (ui.action.textContent !== label) ui.action.textContent = label;
      // Keep keyboard focus during the short landing animation.
      ui.action.setAttribute('aria-disabled', String(state.done || Boolean(state.disabled)));
    }
    if (state.shift !== undefined) ui.backdrop.style.transform = `translateX(${state.shift}%)`;
  }

  function frame(time) {
    const changed = round.step(Math.min((time - (lastFrame ?? time)) / 1000, .04));
    lastFrame = time;
    if (changed) paint();
    animation = requestAnimationFrame(frame);
  }

  function command(input) {
    round.input(input);
    paint();
  }

  host.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.dataset.game) {
      if (button.dataset.game !== selected) choose(button.dataset.game);
    } else if (button?.hasAttribute('data-game-restart')) {
      choose(selected);
      ui.arena.focus({ preventScroll: true });
    } else if (button?.dataset.direction) command(button.dataset.direction);
    else if (button?.hasAttribute('data-game-action')) {
      if (selected === 'tower') command('drop');
      else if (selected === 'glide' && event.detail === 0) {
        command('hold');
        command('release');
      }
    }
  }, { signal });
  host.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('[data-game-restart]')) return;
    const surface = event.target.closest('.game-arena,[data-game-action]');
    if (!surface) return;
    if (selected === 'glide') {
      surface.setPointerCapture(event.pointerId);
      command('hold');
    } else if (selected === 'merge' && ui.arena.contains(event.target)) {
      surface.setPointerCapture(event.pointerId);
      swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    } else if (selected === 'tower' && ui.arena.contains(event.target)) command('drop');
  }, { signal });
  host.addEventListener('pointerup', event => {
    command('release');
    if (swipe?.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = undefined;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 20) command(Math.abs(dx) >= Math.abs(dy)
      ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'up' : 'down');
  }, { signal });
  const releasePointer = () => { command('release'); swipe = undefined; };
  host.addEventListener('pointercancel', releasePointer, { signal });
  host.addEventListener('lostpointercapture', releasePointer, { signal });
  window.addEventListener('blur', releasePointer, { signal });
  window.addEventListener('online', () => {
    const backdrop = ui.backdrop.querySelector('.game-room-art');
    if (backdrop.hidden) backdrop.src = roomBackdrop(gameArt[selected].room) + '?reconnect=1';
  }, { signal });
  reduceMotion.addEventListener('change', paint, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releasePointer();
  }, { signal });
  host.addEventListener('keydown', event => {
    if (selected === 'merge' && keys[event.key] && panel.contains(event.target)) {
      event.preventDefault();
      command(keys[event.key]);
    } else if ((event.code === 'Space' || event.code === 'Enter') && (event.target === ui.arena || event.target === ui.action)) {
      event.preventDefault();
      if (event.repeat) return;
      if (selected === 'tower') command('drop');
      if (selected === 'glide') {
        flightKey = event.code;
        command('hold');
      }
    }
  }, { signal });
  window.addEventListener('keyup', event => {
    if (flightKey !== event.code) return;
    flightKey = undefined;
    command('release');
  }, { signal });
  choose('tower');
  return () => { cancelAnimationFrame(animation); controller.abort(); };
}
