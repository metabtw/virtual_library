export function recordDeskStatus(updates, message) {
  const { desk, status, at } = message ?? {};
  if (typeof desk !== 'string' || (status !== 'desk' && status !== 'break') || !Number.isSafeInteger(at)
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
    return update?.at >= snapshotTime && update.status !== member.status
      ? { ...member, status: update.status } : member;
  });
}
