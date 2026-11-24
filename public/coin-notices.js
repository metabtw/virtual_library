export const coinReasonLabels = {
  welcome: 'coinWelcomeReason', focus: 'coinFocusReason', daily: 'coinDailyReason',
  weekly: 'coinWeeklyReason', referred: 'coinReferredReason', referral: 'coinReferralReason',
  ad: 'coinAdReason', chest: 'coinChestReason', ranking: 'coinRankingReason',
};

export function readCoinReceipts(serialized) {
  try {
    const ids = JSON.parse(serialized ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)).slice(-48) : []);
  } catch {
    return new Set();
  }
}

export function takeNextCoinAward(awards, receipts) {
  for (const award of awards ?? []) {
    if (!award || receipts.has(award.id) || !Object.hasOwn(coinReasonLabels, award.reason)
      || !Number.isInteger(award.amount) || award.amount <= 0) continue;
    receipts.add(award.id);
    if (receipts.size > 48) receipts.delete(receipts.values().next().value);
    return award;
  }
}
