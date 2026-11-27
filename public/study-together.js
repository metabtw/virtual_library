export function readMeetId(value) {
  if (typeof value !== 'string') return null;
  const id = value.replace(/^#meet\//, '');
  return /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ? id.toLowerCase() : null;
}

export function meetLink(id, origin = 'https://virtualstudycrew.com') {
  return origin + '/#meet/' + id;
}

export function meetTimestamp(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return NaN;
  const value = new Date(day + 'T' + time);
  if (Number.isNaN(value.valueOf()) || localMeetInput(value).replace('T', ' ') !== day + ' ' + time) return NaN;
  return value.valueOf();
}

export function localMeetInput(date) {
  const z = value => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + z(date.getMonth() + 1) + '-' + z(date.getDate())
    + 'T' + z(date.getHours()) + ':' + z(date.getMinutes());
}

export function meetDate(startsAt, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(startsAt);
}

export function meetPhase(meet, now = Date.now()) {
  if (now >= meet.startsAt + meet.minutes * 60_000) return 'ended';
  return now >= meet.startsAt - 300_000 ? 'open' : 'upcoming';
}

export function shareMeetText(meet, locale, origin) {
  return meet.topic + ' · ' + meetDate(meet.startsAt, locale) + ' · ' + meet.minutes + (locale === 'tr' ? ' dk' : ' min')
    + '\n' + meetLink(meet.id, origin);
}
