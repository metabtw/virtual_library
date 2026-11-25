import { changeMonth, dayActivity, dayLabel, monthCells, newPlan, plannerToday } from './study-planner.js';

export function mountPlanner(host, { t, locale, escape, request, confirm, saved }) {
  let day = plannerToday();
  let month = day.slice(0, 7);
  let snapshot, editor, busy = false, error = '', closed = false, sequence = 0;
  const button = (action, label, value = '') =>
    `<button class="secondary" type="button" data-plan="${action}" data-value="${escape(value)}">${label}</button>`;
  const today = () => snapshot?.today ?? plannerToday();
  const minutes = count => count + ' ' + t('minuteUnit');
  const questions = count => count + ' ' + t('plannerQuestionUnit');
  const numberField = (name, label, max, disabled = false) =>
    `<label class="field">${t(label)}<input type="number" name="${name}" min="0" max="${max}" inputmode="numeric" value="${editor[name]}" ${disabled ? 'disabled' : ''} required></label>`;

  function render() {
    if (closed) return;
    const activity = dayActivity(snapshot, day);
    const withQuestions = Boolean(editor?.questions || editor?.solved);
    host.innerHTML = `<section class="card planner-card" aria-labelledby="planner-title">
      <div class="planner-heading"><h2 id="planner-title">${t('planner')}</h2>${button('today', t('plannerToday'))}</div>
      <p class="planner-muted">${t('plannerPrivate')}</p>
      <div class="planner-layout"><div>
        <div class="planner-heading">
          ${button('previous', `<span aria-hidden="true">‹</span><span class="sr-only">${t('plannerPrevious')}</span>`)}
          <b>${dayLabel(month,locale,true)}</b>
          ${button('next', `<span aria-hidden="true">›</span><span class="sr-only">${t('plannerNext')}</span>`)}
        </div>
        <div class="planner-calendar">
          ${t('plannerWeekdays').split(',').map(name => `<small>${name}</small>`).join('')}
          ${monthCells(month).map(date => {
            if (!date) return '<span></span>';
            const summary = dayActivity(snapshot,date);
            return `<button type="button" data-plan="day" data-value="${date}" aria-pressed="${date === day}"
              ${date === today() ? 'aria-current="date"' : ''}
              aria-label="${dayLabel(date,locale)} · ${minutes(summary.minutes)} · ${questions(summary.solved)}">
              ${Number(date.slice(-2))}${summary.minutes || summary.plans.length ? `<small>${summary.minutes ? minutes(summary.minutes) : '•'}</small>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div><div class="planner-day">
        <div class="planner-heading"><h3>${dayLabel(day,locale)}</h3>${button('add', t('plannerAdd'))}</div>
        <div class="planner-totals"><b>${minutes(activity.minutes)}${activity.target ? ' / ' + activity.target : ''}</b>
          <b>${questions(activity.solved)}${activity.questions ? ' / ' + activity.questions : ''}</b></div>
        ${activity.recorded ? `<small class="planner-muted">${t('plannerRecorded')} · ${minutes(activity.recorded)}</small>` : ''}
        <div data-plan-message role="status">${escape(error || (busy ? t('loading') : ''))}</div>
        ${editor ? `<form data-plan-form class="planner-form">
          <label class="field">${t('plannerTopic')}<input name="topic" value="${escape(editor.topic)}" maxlength="100" required></label>
          <div class="planner-fields">
            ${numberField('minutes','plannerMinutes',1440)}
            ${day <= today() ? numberField('logged_minutes','plannerLogged',1440) : ''}
          </div>
          <label class="planner-check"><input type="checkbox" data-plan-questions ${withQuestions ? 'checked' : ''}> ${t('plannerQuestionToggle')}</label>
          <div class="planner-fields" data-question-fields ${withQuestions ? '' : 'hidden'}>
            ${numberField('questions','plannerQuestions',10000,!withQuestions)}
            ${day <= today() ? numberField('solved','plannerSolved',10000,!withQuestions) : ''}
          </div>
          <label class="field">${t('plannerReminder')}<input type="time" name="reminder" value="${escape(editor.reminder)}"></label>
          <small>${t('plannerReminderHelp')}</small>
          <label class="field">${t('plannerNotes')}<textarea name="notes" maxlength="500" rows="3">${escape(editor.notes)}</textarea></label>
          <div class="planner-actions"><button class="primary">${t('plannerSave')}</button>${button('cancel',t('cancel'))}
          ${editor.id ? button('remove',t('plannerRemove')) : ''}</div>
        </form>` : ''}
        ${!editor && !busy && !activity.plans.length && !activity.sessions.length ? `<p class="planner-muted">${t('plannerEmpty')}</p>` : ''}
        ${activity.plans.map(plan => {
          const recorded = activity.sessions.filter(entry => entry.planId === plan.id).reduce((total,entry) => total + entry.minutes,0);
          return `<article class="planner-entry"><div class="planner-heading"><strong>${escape(plan.topic)}</strong>
            ${button('edit',t('plannerEdit'),plan.id)}</div>
            <small>${minutes(recorded + plan.logged_minutes)} / ${plan.minutes} · ${questions(plan.solved)} / ${plan.questions}
            ${plan.reminder ? ' · ' + escape(plan.reminder.slice(0,5)) : ''}</small>
            ${plan.notes ? `<p>${escape(plan.notes)}</p>` : ''}
          </article>`;
        }).join('')}
        ${activity.sessions.length ? `<h4>${t('plannerHistory')}</h4><ul class="planner-history">${activity.sessions.map(entry =>
          `<li><span>${escape(entry.topic ?? t('plannerUntitled'))}</span><b>${minutes(entry.minutes)}</b></li>`).join('')}</ul>` : ''}
      </div></div>
    </section>`;
  }

  async function load(payload = {}) {
    const current = ++sequence;
    error = '';
    busy = true;
    if (payload.op) {
      const form = host.querySelector('[data-plan-form]');
      form?.querySelectorAll('button').forEach(control => { control.disabled = true; });
      host.querySelector('[data-plan-message]').textContent = t('loading');
    } else render();
    try {
      const result = await request({ month, ...payload });
      if (closed || current !== sequence) return;
      snapshot = result;
      if (payload.op) { editor = undefined; saved(); }
    } catch (failure) {
      if (!closed && current === sequence) error = t(failure.message) === failure.message ? t('server') : t(failure.message);
    } finally {
      if (!closed && current === sequence) { busy = false; render(); }
    }
  }

  function open(next) {
    editor = next;
    error = '';
    render();
    if (editor) host.querySelector('[name="topic"]').focus();
  }

  host.addEventListener('click', async event => {
    const control = event.target.closest('[data-plan]');
    if (!control || busy) return;
    const { plan, value } = control.dataset;
    if (plan === 'day') { day = value; open(undefined); }
    if (plan === 'add') open(newPlan(day));
    if (plan === 'cancel') open(undefined);
    if (plan === 'edit') {
      const item = snapshot?.plans.find(item => item.id === value);
      if (item) open({ ...item, reminder: item.reminder?.slice(0,5) ?? '' });
    }
    if (plan === 'remove' && editor?.id && await confirm(t('plannerRemove'),t('plannerRemoveConfirm')) && !closed)
      void load({ op: 'remove', id: editor.id });
    if (['previous','next','today'].includes(plan)) {
      const next = plan === 'today' ? today().slice(0,7) : changeMonth(month, plan === 'previous' ? -1 : 1);
      day = plan === 'today' ? today() : next + '-01';
      editor = undefined;
      if (month === next && snapshot) render();
      else { month = next; snapshot = undefined; void load(); }
    }
  });
  host.addEventListener('change', event => {
    if (!event.target.matches('[data-plan-questions]')) return;
    const controls = host.querySelector('[data-question-fields]');
    controls.hidden = !event.target.checked;
    controls.querySelectorAll('input').forEach(field => { field.disabled = controls.hidden; });
  });
  host.addEventListener('submit', event => {
    if (!event.target.matches('[data-plan-form]')) return;
    event.preventDefault();
    if (busy || !editor) return;
    const fields = Object.fromEntries(new FormData(event.target));
    editor = { ...editor, ...fields,
      minutes: Number(fields.minutes), questions: Number(fields.questions ?? 0),
      logged_minutes: Number(fields.logged_minutes ?? 0), solved: Number(fields.solved ?? 0) };
    void load({ op: 'save', ...editor });
  });
  void load();
  return { refresh: () => { if (!closed && !editor && !busy) void load(); }, close: () => { closed = true; } };
}
