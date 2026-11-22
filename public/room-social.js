export function splitProfileCode(input, fallback = 'SK') {
  const value = input.trim().toUpperCase();
  const supplied = /^(SK|DV)-/.exec(value);
  return {
    prefix: supplied?.[1] ?? fallback,
    suffix: value.slice(supplied?.[0].length ?? 0).replace(/[^A-Z0-9]/g, '').slice(0, 12),
  };
}

export function inviteWait(retryAt, now) {
  return Math.max(0, Math.ceil(((retryAt ?? 0) - now) / 1000));
}
