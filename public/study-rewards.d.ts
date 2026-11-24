export const roomGoalMinutes: number;
export const roomThemeUnlockMinutes: number;
export const breakPresets: Readonly<Record<string, number>>;
export type RoomProgress = { settled: number; live: { start: number; until: number }[] };
export function roomProgressMinutes(goal: RoomProgress | undefined, now: number): number;
export const boxLabels: { basic: 'boxBasic'; epic: 'boxEpic'; legendary: 'boxLegendary' };
export const boxArt: { basic: 'mysteryBox'; epic: 'epicBox'; legendary: 'legendaryBox' };
export const premiumAmbience: readonly string[];
export function canBuyFromShop(item: { kind: string; box_only?: boolean }): boolean;
export function boxOdds<Item extends string>(
  rewards: readonly { item: Item; weight: number }[], owned: { has(item: Item): boolean },
): { item: Item; chance: number }[];

export function adCooldownSeconds(retryAt: number | null | undefined, serverNow: number): number;
