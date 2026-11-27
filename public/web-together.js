import { localMeetInput, meetDate, meetLink, meetPhase, meetTimestamp, shareMeetText } from './study-together.js';
import { messageFor } from './web-social.js';

export function mountTogether(host, { id, signedIn, t, locale, escape, invoke, join, share, confirm, changed, card }) {
  const controller = new AbortController();
  const { signal } = controller;
  let data, pending = false, error = '', phaseSignature;
  const values = new Map();
  const target = () => id ? (signedIn ? invoke('studyTogether', { op: 'meet', id }) : invoke('studyMeetPreview', { id }))
    : invoke('studyTogether');
  const format = meet => meetDate(meet.startsAt, locale) + ' · ' + meet.minutes + ' ' + t('minuteUnit');
  const mobile = /Android|iPhone|iPad/.test(navigator.userAgent);
  const roomName = meet => locale === 'tr' ? meet.room : meet.roomEn;
  const button = (op, label, key, kind = 'secondary') =>
    `<button type="button" class="${kind}" data-together="${op}" data-key="${escape(key)}">${t(label)}</button>`;

  function meetCard(meet) {
    const phase = meetPhase(meet);
    return `<article class="card together-entry">
      <h3>${escape(meet.topic)}</h3>
      <p>${escape(format(meet))} · ${escape(roomName(meet))}</p>
      <small>${t('meetBy')} · ${escape(meet.host)}</small>
      ${!signedIn ? `<p>${t('meetSignIn')}</p>
        ${mobile ? `<a class="secondary" href="sanalkutuphane://?meet=${escape(meet.id)}">${t('meetOpenApp')}</a>` : ''}` : `<div class="together-actions">
        ${phase !== 'ended' && !meet.joined ? button('rsvp','meetRSVP',meet.id,'primary') : ''}
        ${phase === 'open' && meet.joined ? button('join','meetJoin',meet.id,'primary') : ''}
        ${phase === 'upcoming' && meet.joined ? button(meet.remind ? 'unremind' : 'remind', meet.remind ? 'meetRemindOff' : 'meetRemind', meet.id) : ''}
        ${phase !== 'ended' ? button('share','meetShare',meet.id) : ''}
        ${phase !== 'ended' && meet.joined ? button(meet.owner ? 'cancelMeet' : 'leaveMeet',meet.owner ? 'meetCancel' : 'meetLeave',meet.id) : ''}
        </div><p>${t(phase === 'ended' ? 'meetEnded' : meet.remind ? 'meetReminderOn' : meet.joined && phase === 'upcoming' ? 'meetTooEarly' : meet.joined ? 'meetJoined' : 'meetTitle')}</p>`}</article>`;
  }

  function goalCard(goal) {
    const complete = !goal.invite && goal.progress >= goal.target;
    return `<article class="card together-entry">
      <h3>${escape(goal.friend)}</h3><small>${escape(goal.week)}</small>
      ${goal.invite ? `<p>${t(goal.own ? 'pairAsked' : 'pairIncoming')}</p>` :
        `<p>${goal.progress} / ${goal.target} ${t('pairTarget')}</p>
        <progress value="${goal.progress}" max="${goal.target}" aria-label="${t('pairTarget')}"></progress>`}
      <div class="together-actions">
        ${goal.invite && !goal.own ? button('acceptGoal','pairAccept',goal.id,'primary') : ''}
        ${button('avatar','pairAvatar',goal.id).replace('data-together=', 'aria-pressed="' + goal.avatarAllowed + '" data-together=')}
        ${complete && goal.partnerAvatar ? button('card','pairShare',goal.id,'primary') : ''}
        ${button('leaveGoal','pairLeave',goal.id)}</div>
      ${complete && !goal.partnerAvatar ? `<p>${t('pairOtherAvatar')}</p>` : ''}</article>`;
  }

  function render() {
    if (signal.aborted) return;
    const open = new Set([...host.querySelectorAll('details[open]')].map(node => node.dataset.togetherForm));
    const focus = document.activeElement;
    const focusOperation = host.contains(focus) ? focus.dataset?.together : '';
    const focusKey = focus?.dataset?.key;
    const meeting = data && (id ? [data] : data.meets);
    phaseSignature = meeting?.map(meet => meetPhase(meet)).join(',');
    const local = new Date(Date.now() + 60 * 60_000);
    const value = (name, fallback = '') => escape(values.get(name) ?? fallback);
    const title = id ? t('meetTitle') : t('together');
    host.innerHTML = `<section class="together-page" aria-label="${title}">
      <div class="heading compact-heading"><h${signedIn ? 1 : 2}>${title}</h${signedIn ? 1 : 2}>
      ${signedIn ? `<a class="secondary" href="${id ? '#together' : '#rooms'}">${t('tourPrevious')}</a>` : ''}</div>
      <p role="status" class="auth-feedback">${error ? escape(error) : ''}</p>
      ${!data ? `<p>${error ? button('retry','retry','') : t('loading')}</p>` : id ? meetCard(data) :
        `<div class="together-grid"><section>
          <h2>${t('meetings')}</h2>
          <details class="card" data-together-form="meet" ${open.has('meet') ? 'open' : ''}><summary>${t('meetCreate')}</summary>
          <form class="stacked" data-together-submit="createMeet">
            <label class="field">${t('meetTopic')}<input name="topic" required minlength="2" maxlength="80" value="${value('topic')}"></label>
            <label class="field">${t('meetWhen')}<input name="starts" required type="datetime-local" value="${value('starts', localMeetInput(local))}"></label>
            <label class="field">${t('minuteUnit')}<input name="minutes" required type="number" min="5" max="180" value="${value('minutes', 25)}"></label>
            <label class="field">${t('meetRoom')}<select name="room" required>${data.rooms.map(room =>
              `<option value="${escape(room.id)}" ${values.get('room') === room.id ? 'selected' : ''}>${escape(locale === 'tr' ? room.name : room.nameEn)}</option>`).join('')}</select></label>
            <button class="primary">${t('meetCreate')}</button></form></details>
          ${data.meets.map(meetCard).join('') || `<p>${t('meetEmpty')}</p>`}
        </section><section>
          <h2>${t('pairGoals')}</h2><p>${t('pairRules')}</p>
          ${data.friends.length ? `<details class="card" data-together-form="goal" ${open.has('goal') ? 'open' : ''}><summary>${t('pairCreate')}</summary>
          <form class="stacked" data-together-submit="createGoal">
            <label class="field">${t('pairFriend')}<select name="friend" required>${data.friends.map(friend =>
              `<option value="${escape(friend.id)}" ${values.get('friend') === friend.id ? 'selected' : ''}>${escape(friend.name)}</option>`).join('')}</select></label>
            <label class="field">${t('pairTarget')}<input name="target" type="number" min="1" max="10" required value="${value('target',3)}"></label>
            <label class="together-check"><input name="avatar" type="checkbox" ${values.get('avatar') ? 'checked' : ''}> ${t('pairAvatar')}</label>
            <button class="primary">${t('pairCreate')}</button></form></details>` : `<p>${t('pairNoFriends')}</p>`}
          ${data.goals.map(goalCard).join('') || `<p>${t('pairEmpty')}</p>`}
        </section></div>`}</section>`;
    if (focusOperation) [...host.querySelectorAll('[data-together]')].find(b => b.dataset.together === focusOperation && b.dataset.key === focusKey)
      ?.focus({ preventScroll: true });
  }

  async function perform(work) {
    if (pending || signal.aborted) return;
    pending = true;
    error = '';
    host.setAttribute('aria-busy', 'true');
    try { await work(); }
    catch (failure) { error = messageFor(failure?.message, t); }
    finally { pending = false; host.removeAttribute('aria-busy'); render(); }
  }
  async function reload() { data = await target(); }

  host.addEventListener('input', event => {
    const field = event.target;
    if (field.closest('[data-together-submit]')) values.set(field.name, field.type === 'checkbox' ? field.checked : field.value);
  }, { signal });
  host.addEventListener('submit', event => {
    const form = event.target;
    if (!form.dataset.togetherSubmit) return;
    event.preventDefault();
    const fields = new FormData(form);
    const op = form.dataset.togetherSubmit;
    void perform(async () => {
      if (op === 'createMeet') {
        const [day, hour] = String(fields.get('starts')).split('T');
        const meet = await invoke('studyTogether', { op, startsAt: meetTimestamp(day, hour), minutes: Number(fields.get('minutes')),
          topic: fields.get('topic'), room: fields.get('room') });
        if (!signal.aborted) location.hash = 'meet/' + meet.id;
      } else {
        await invoke('studyTogether', { op, id: fields.get('friend'), target: Number(fields.get('target')), avatar: fields.has('avatar') });
        values.delete('target');
        await reload();
      }
    });
  }, { signal });
  host.addEventListener('click', async event => {
    const control = event.target.closest('[data-together]');
    if (!control || pending) return;
    const { together: op, key } = control.dataset;
    const meet = (id ? [data] : data?.meets)?.find(item => item?.id === key);
    const goal = data?.goals?.find(item => item.id === key);
    if (op === 'share') { await share(shareMeetText(meet, locale, location.origin), meetLink(meet.id, location.origin)); return; }
    if (op === 'card') { card(goal); return; }
    if (op === 'cancelMeet' && !await confirm(t('meetCancel'),t('meetCancelConfirm'))) return;
    if (op === 'leaveGoal' && !await confirm(t('pairLeave'),t('pairLeaveConfirm'))) return;
    void perform(async () => {
      if (op === 'retry') { await reload(); return; }
      if (op === 'join') { await join(meet); return; }
      const mapped = { remind: 'rsvp', unremind: 'rsvp', avatar: 'shareGoalAvatar' };
      await invoke('studyTogether', { op: mapped[op] ?? op, id: key,
        remind: op === 'remind' ? true : op === 'unremind' ? false : undefined,
        avatar: op === 'avatar' ? !goal.avatarAllowed : op === 'acceptGoal' ? goal.avatarAllowed : undefined });
      if (meet) changed();
      if (op === 'cancelMeet' && id && !signal.aborted) location.hash = 'together';
      else await reload();
    });
  }, { signal });

  render();
  void perform(reload);
  const poll = setInterval(async () => {
    if (pending || document.hidden || !data || document.activeElement?.closest('[data-together-submit]')) return;
    try {
      const next = await target();
      if (!pending && !signal.aborted && JSON.stringify(data) !== JSON.stringify(next)) {
        data = next;
        render();
      }
    } catch {}
  }, 15000);
  const timer = setInterval(() => {
    const phases = (data && (id ? [data] : data.meets))?.map(meet => meetPhase(meet)).join(',');
    if (phaseSignature !== phases && !pending && !document.activeElement?.closest('[data-together-submit]')) render();
  }, 1000);
  return () => { controller.abort(); clearInterval(timer); clearInterval(poll); };
}
