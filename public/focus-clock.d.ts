export type ServerClock = { serverTime: number; receiveTime: number; receivedMonotonic: number };
type FocusWindow = {
  state: string; end: number; paused_at: number | null;
  next_check_at?: number | null; check_until?: number | null;
};
export function markServerTime(serverTime: number, receiveTime?: number): ServerClock;
export function serverTimeAt(clock: ServerClock, monotonic?: number): number;
export function focusRemaining(session: Pick<FocusWindow, 'end' | 'paused_at'>, observed: number): number;
export function verificationRemaining(session: FocusWindow | null | undefined, observed: number): number;
