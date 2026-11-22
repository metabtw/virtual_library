export type ProfileCodePrefix = 'SK' | 'DV';
export function splitProfileCode(input: string, fallback?: ProfileCodePrefix): { prefix: ProfileCodePrefix; suffix: string };
export function inviteWait(retryAt: number | null | undefined, now: number): number;
