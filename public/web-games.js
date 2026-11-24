import { bookColors, dropBook, gameIds, gameText, mergeIcons, newGlide, newMerge, newTower,
  slideMerge, tickGlide, tickTower } from './study-games.js';

const arrows = { left: '←', up: '↑', down: '↓', right: '→' };

export function mountGames(host, locale) {
  const t = gameText(locale);
  let selected, arena, status, action, animation, lastFrame, tower, merge, glide;
  let held = false;
  let touchStart;
  host.insertAdjacentHTML('beforeend', `
    <div class="game-choices" aria-label="${host.querySelector('h1').textContent}">${gameIds.map((id, index) =>
      `<button class="secondary" data-game="${id}"><span aria-hidden="true">${['▣', '☕', '➤'][index]}</span> ${t.titles[id]}</button>`).join('')}</div>
    <section class="card game-card" aria-labelledby="game-title"></section>`);
  const panel = host.querySelector('.game-card');
  const stop = () => { cancelAnimationFrame(animation); held = false; lastFrame = undefined; };

  function choose(id) {
    stop();
    selected = id;
    tower = newTower();
    merge = newMerge();
    glide = newGlide();
    host.querySelectorAll('[data-game]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.game === id));
    });
    panel.innerHTML = `<div class="game-top"><h2 id="game-title">${t.titles[id]}</h2>
      <button class="secondary" data-game-restart>${t.restart}</button></div><p>${t.help[id]}</p>
      <output class="game-score"></output><div class="game-arena game-${id}" tabindex="0" aria-label="${t.titles[id]}"></div>
      <div class="game-actions">${id === 'merge'
        ? Object.entries(arrows).map(([direction, arrow]) => `<button class="secondary" data-direction="${direction}" aria-label="${t.directions[direction]}">${arrow}</button>`).join('')
        : `<button class="primary" data-game-action>${id === 'tower' ? t.drop : t.start}</button>`}</div>`;
    arena = panel.querySelector('.game-arena');
    status = panel.querySelector('output');
    action = panel.querySelector('[data-game-action]');
    paint();
    if (id !== 'merge') animation = requestAnimationFrame(frame);
  }

  function setStatus(text) {
    if (status.textContent !== text) status.textContent = text;
  }

  function paint() {
    if (selected === 'tower') {
      const history = tower.books.slice(-9);
      const stack = history.map((book, index) => `<i class="game-book" style="left:${book.x}%;width:${book.width}%;bottom:${8 + index * 7.5}%;
        background:${bookColors[(tower.books.length - history.length + index) % bookColors.length]}"></i>`).join('');
      arena.innerHTML = stack + (tower.done ? '' : `<i class="game-book moving-book" style="left:${tower.x}%;width:${tower.width}%;background:${bookColors[tower.books.length % bookColors.length]}"></i>`);
      setStatus(`${t.books} · ${tower.books.length - 1}${tower.done ? ' · ' + t.ended : ''}`);
      action.disabled = tower.done;
    } else if (selected === 'merge') {
      arena.innerHTML = merge.board.map(item => {
        const index = Math.min(item, t.items.length - 1);
        return `<div class="merge-tile" data-level="${item}" style="--tile-color:${bookColors[(item - 1) % bookColors.length] || 'transparent'}">
          ${item ? `<b aria-hidden="true">${mergeIcons[index]}</b><span>${t.items[index]}</span>` : ''}</div>`;
      }).join('');
      setStatus(`${t.score} · ${merge.score}${merge.done ? ' · ' + t.ended : ''}`);
    } else {
      arena.innerHTML = `<i class="game-plane" style="top:${glide.y}%;transform:rotate(${glide.velocity / 2}deg)"></i>` + glide.gates.map(gate =>
        `<i class="glide-shelf" style="left:${gate.x}%;top:0;height:${gate.gap - 17}%"></i>
        <i class="glide-shelf" style="left:${gate.x}%;top:${gate.gap + 17}%;bottom:0"></i>
        ${gate.collected ? '' : `<i class="glide-orb" style="left:${gate.x + 3}%;top:${gate.gap}%"></i>`}`).join('');
      setStatus(`${t.score} · ${glide.score} / ${t.hits} · ${glide.hits}/5${glide.hits === 5 ? ' · ' + t.ended : ''}`);
      if (glide.active && action.textContent !== t.lift) action.textContent = t.lift;
      action.disabled = glide.hits === 5;
    }
  }

  function frame(time) {
    const elapsed = Math.min((time - (lastFrame ?? time)) / 1000, 0.04);
    lastFrame = time;
    if (selected === 'tower' && !tower.done) {
      tower = tickTower(tower, elapsed);
      const book = arena.querySelector('.moving-book');
      if (book) book.style.left = `${tower.x}%`;
    } else if (selected === 'glide' && glide.active && glide.hits < 5) {
      glide = tickGlide(glide, held, elapsed);
      paint();
    }
    animation = requestAnimationFrame(frame);
  }

  function act(direction) {
    if (selected === 'tower') tower = dropBook(tower);
    if (selected === 'merge' && direction) merge = slideMerge(merge, direction);
    if (selected === 'glide') { glide.active = true; held = true; }
    paint();
  }

  const controller = new AbortController();
  const { signal } = controller;
  host.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.dataset.game) choose(button.dataset.game);
    else if (button?.hasAttribute('data-game-restart')) choose(selected);
    else if (button?.dataset.direction) act(button.dataset.direction);
    else if (button?.hasAttribute('data-game-action') && selected !== 'glide') act();
  }, { signal });
  host.addEventListener('pointerdown', event => {
    if (selected === 'glide' && glide.hits < 5 && event.target.closest('.game-arena,[data-game-action]')) {
      event.target.closest('.game-arena,[data-game-action]').setPointerCapture(event.pointerId);
      act();
    } else if (selected === 'merge' && arena.contains(event.target)) {
      arena.setPointerCapture(event.pointerId);
      touchStart = [event.clientX, event.clientY];
    } else if (selected === 'tower' && arena.contains(event.target)) act();
  }, { signal });
  host.addEventListener('pointerup', event => {
    held = false;
    if (!touchStart) return;
    const dx = event.clientX - touchStart[0], dy = event.clientY - touchStart[1];
    touchStart = undefined;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 20) act(Math.abs(dx) >= Math.abs(dy)
      ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'up' : 'down');
  }, { signal });
  host.addEventListener('pointercancel', () => { held = false; touchStart = undefined; }, { signal });
  window.addEventListener('blur', () => { held = false; }, { signal });
  host.addEventListener('keydown', event => {
    if (selected === 'merge' && event.key.startsWith('Arrow')) {
      event.preventDefault();
      act(event.key.slice(5).toLowerCase());
    } else if ((event.code === 'Space' || event.code === 'Enter') && (event.target === arena || event.target === action)) {
      event.preventDefault();
      if (!event.repeat) act();
    }
  }, { signal });
  window.addEventListener('keyup', () => { held = false; }, { signal });
  choose('tower');
  return () => { stop(); controller.abort(); };
}
