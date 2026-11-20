type Gender = 'unspecified' | 'female' | 'male';

export const avatarSize: { width: number; height: number };
export const hairStyles: Record<Gender, { tr: string[]; en: string[] }>;
export function drawAvatar(
  avatar: { gender?: Gender; hair: number; outfit: number; color: string },
  paint: (color: string, blocks: [number, number, number, number][]) => void,
): void;
export function drawProp(
  name: 'cat' | 'lamp' | 'leaves' | 'pot',
  paint: (color: string, x: number, y: number) => void,
): void;
