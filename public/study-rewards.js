export const roomGoalMinutes = 100;

export const boxLabels = { basic: 'boxBasic', epic: 'boxEpic', legendary: 'boxLegendary' };

export const boxArt = { basic: 'mysteryBox', epic: 'epicBox', legendary: 'legendaryBox' };
export const premiumAmbience = ['space', 'forest', 'shore'];

export function canBuyFromShop(item) {
  return !item.box_only && item.kind !== 'rare';
}

export function boxOdds(rewards, owned) {
  const available = rewards.filter(reward => !owned.has(reward.item));
  const total = available.reduce((sum, reward) => sum + reward.weight, 0);
  return rewards.map(reward => ({
    item: reward.item,
    chance: owned.has(reward.item) ? 0 : reward.weight / total,
  }));
}

export function adCooldownSeconds(retryAt, serverNow) {
  return Math.max(0, Math.ceil(((retryAt ?? 0) - serverNow) / 1000));
}
