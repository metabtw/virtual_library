export const plannerTimezone = 'Europe/Istanbul';

const istanbulDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: plannerTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function plannerToday(time = Date.now()) {
  const { year, month, day } = Object.fromEntries(istanbulDate.formatToParts(time).map(part => [part.type,part.value]));
  return year + '-' + month + '-' + day;
}

export function changeMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function monthCells(month) {
  const [year, number] = month.split('-').map(Number);
  const prefix = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array(prefix).fill(null).concat(Array.from({ length: count }, (_, index) => month + '-' + String(index + 1).padStart(2, '0')));
}

export function dayLabel(day, locale, monthOnly = false) {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric',
    ...(monthOnly ? {} : { day: 'numeric' }) }).format(new Date(day.length === 7 ? day + '-01' : day));
}

export function dayActivity(calendar, day) {
  const plans = (calendar?.plans ?? []).filter(plan => plan.day === day);
  const sessions = (calendar?.sessions ?? []).filter(session => session.day === day);
  const recorded = sessions.reduce((total, session) => total + session.minutes, 0);
  return {
    plans, sessions, recorded,
    minutes: recorded + plans.reduce((total, plan) => total + plan.logged_minutes, 0),
    target: plans.reduce((total, plan) => total + plan.minutes, 0),
    solved: plans.reduce((total, plan) => total + plan.solved, 0),
    questions: plans.reduce((total, plan) => total + plan.questions, 0),
  };
}

export const newPlan = day => ({
  day, topic: '', minutes: 0, questions: 0, logged_minutes: 0, solved: 0, notes: '', reminder: '',
});
