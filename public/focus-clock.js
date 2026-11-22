export function markServerTime(serverTime, receiveTime = Date.now()) {
  return {
    serverTime,
    receiveTime,
    receivedMonotonic: performance.now() - Math.max(0, Date.now() - receiveTime),
  };
}

export function serverTimeAt(clock, monotonic = performance.now()) {
  return clock.serverTime + Math.max(0, monotonic - clock.receivedMonotonic);
}

export function focusRemaining(session, observed) {
  return Math.max(0, session.end - (session.paused_at ?? observed));
}

export function verificationRemaining(session, observed) {
  if (session?.state !== 'active' || session.next_check_at == null || session.check_until == null) return 0;
  return observed >= session.next_check_at ? Math.max(0, session.check_until - observed) : 0;
}
