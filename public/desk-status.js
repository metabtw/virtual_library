export function recordDeskStatus(updates, message) {
  const { desk, status, at } = message ?? {};
  if (typeof desk !== 'string' || !['desk', 'break', 'working', 'awayReels', 'awaySleep', 'awayBusy', 'missedCheck'].includes(status) || !Number.isSafeInteger(at)
    || (updates.get(desk)?.at ?? 0) >= at) return updates;
  const next = new Map(updates);
  next.delete(desk);
  next.set(desk, { status, at });
  if (next.size > 32) next.delete(next.keys().next().value);
  return next;
}

export function displayDeskStatuses(members, snapshotTime, updates) {
  if (updates.size === 0) return members;
  return members.map(member => {
    const update = updates.get(member.desk_ref);
    if (!(update?.at >= snapshotTime) || update.status === (member.activity ?? member.status)) return member;
    if (member.activity || !['desk', 'break'].includes(update.status)) {
      return { ...member, activity: update.status, status: update.status === 'break' ? 'break' : 'desk' };
    }
    return { ...member, status: update.status };
  });
}
