export const roomGoalMinutes: number;
export const boxLabels: { basic: 'boxBasic'; epic: 'boxEpic'; legendary: 'boxLegendary' };
export const boxArt: { basic: 'mysteryBox'; epic: 'epicBox'; legendary: 'legendaryBox' };
export const premiumAmbience: readonly string[];
export function canBuyFromShop(item: { kind: string; box_only?: boolean }): boolean;
export function boxOdds<Item extends string>(
  rewards: readonly { item: Item; weight: number }[], owned: { has(item: Item): boolean },
): { item: Item; chance: number }[];

type Quest = { coins: number; completed: boolean };
type QuestSnapshot = {
  dailyQuests?: { date: string; goals: (Quest & { minutes: number })[] };
  weeklyQuests?: { start: string; goals: (Quest & { id: string })[] };
};
export function earnedQuestCoins(previous: QuestSnapshot, current: QuestSnapshot): number;
export function adCooldownSeconds(retryAt: number | null | undefined, serverNow: number): number;
