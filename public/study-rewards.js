export const roomGoalMinutes = 100;
export const mysteryBoxPrice = 50;

export function adCooldownSeconds(retryAt, serverNow) {
  return Math.max(0, Math.ceil(((retryAt ?? 0) - serverNow) / 1000));
}
