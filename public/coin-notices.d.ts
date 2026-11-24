export const coinReasonLabels: {
  welcome: 'coinWelcomeReason'; focus: 'coinFocusReason'; daily: 'coinDailyReason';
  weekly: 'coinWeeklyReason'; referred: 'coinReferredReason'; referral: 'coinReferralReason';
  ad: 'coinAdReason'; chest: 'coinChestReason'; ranking: 'coinRankingReason';
};
export type CoinAward = { id: string; reason: keyof typeof coinReasonLabels; amount: number };
export function readCoinReceipts(serialized?: string | null): Set<string>;
export function takeNextCoinAward(awards: CoinAward[] | undefined, receipts: Set<string>): CoinAward | undefined;
