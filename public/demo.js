export const demoStorageKey = 'vsc-demo-session';
export const demoDurations = [5, 25, 50, 90];

export function parseDemo(text) {
  try {
    const value = JSON.parse(text);
    if (typeof value?.id === 'string' && /^[\da-f]{64}$/.test(value.key)) return { id: value.id, key: value.key };
  } catch { /* A guest can start over without usable credentials. */ }
  return null;
}

export function demoClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const mins = Math.floor(seconds / 60);
  return [mins, seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
}

export function demoError(error) {
  const key = error?.message;
  return ['demoLimit', 'demoMissing', 'demoAccountUsed', 'demoImported', 'networkUnavailable'].includes(key) ? key : 'server';
}
