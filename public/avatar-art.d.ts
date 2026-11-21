type Gender = 'unspecified' | 'female' | 'male';
export type HairSkin = 'copperCurls' | 'silverBraid' | 'midnightFade';
export type OutfitSkin = 'auroraHood' | 'archiveVest' | 'moonCoat';
export type PropName =
  | 'cat' | 'lamp' | 'leaves' | 'pot' | 'catSleep' | 'catUpset' | 'neon' | 'goldKeys' | 'dragon'
  | 'teaSet' | 'hourglass' | 'miniGlobe' | 'crystalTerrarium';

export const avatarSize: { width: number; height: number };
export const hairStyles: Record<Gender, { tr: string[]; en: string[] }>;
export function drawAvatar(
  avatar: { gender?: Gender; hair: number; outfit: number; color: string; hairSkin?: HairSkin; outfitSkin?: OutfitSkin },
  paint: (color: string, blocks: [number, number, number, number][]) => void,
): void;
export function drawProp(
  name: PropName,
  paint: (color: string, x: number, y: number) => void,
): void;
