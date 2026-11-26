export const demoStorageKey: string;
export const demoDurations: readonly number[];
export interface DemoAccess { id: string; key: string }
export interface DemoState {
  id: string; now: number; expiresAt: number; minutes: number; startAt: number | null;
  endAt: number | null; verifyAt: number | null; imported: boolean; outcome: string | null;
}
export function parseDemo(text: string | null): DemoAccess | null;
export function demoClock(milliseconds: number): string;
export function demoError(error: unknown): 'demoLimit' | 'demoMissing' | 'demoAccountUsed' | 'demoImported' | 'networkUnavailable' | 'server';
