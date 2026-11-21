type Status = 'desk' | 'break';
export type DeskActivity = Status | 'working';
type DeskPeer = { desk_ref?: string; status: Status; activity?: DeskActivity };
export type DeskUpdates = Map<string, { status: DeskActivity; at: number }>;
export function recordDeskStatus(updates: DeskUpdates, message: unknown): DeskUpdates;
export function displayDeskStatuses<Member extends DeskPeer>(members: Member[], snapshotTime: number, updates: DeskUpdates): Member[];
