type Status = 'desk' | 'break';
type DeskPeer = { desk_ref?: string; status: Status };
export type DeskUpdates = Map<string, { status: Status; at: number }>;
export function recordDeskStatus(updates: DeskUpdates, message: unknown): DeskUpdates;
export function displayDeskStatuses<Member extends DeskPeer>(members: Member[], snapshotTime: number, updates: DeskUpdates): Member[];
