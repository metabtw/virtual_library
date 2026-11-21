type Gender = 'unspecified' | 'female' | 'male';
export type HairSkin = 'copperCurls' | 'silverBraid' | 'midnightFade' | 'lavenderBuns' | 'mintBob';
export type OutfitSkin = 'auroraHood' | 'archiveVest' | 'moonCoat' | 'autumnPoncho' | 'starlightJacket' | 'mossOveralls';
export type PropName =
  | 'cat' | 'lamp' | 'leaves' | 'pot' | 'catSleep' | 'catUpset' | 'neon' | 'goldKeys' | 'dragon'
  | 'teaSet' | 'hourglass' | 'miniGlobe' | 'crystalTerrarium'
  | 'mushroomLamp' | 'foxMug' | 'retroRadio' | 'jellyTank' | 'origamiCrane';

export const avatarSize: { width: number; height: number };
export const writingSize: { width: number; height: number; frames: number };
export const hairStyles: Record<Gender, { tr: string[]; en: string[] }>;
type BaseAvatar = { gender?: Gender; hair: number; outfit: number; color: string };
export function dressedAvatar<T extends BaseAvatar>(avatar: T, equipped: readonly string[]): T & {
  hairSkin?: HairSkin; outfitSkin?: OutfitSkin;
};
export function drawAvatar(
  avatar: BaseAvatar & { hairSkin?: HairSkin; outfitSkin?: OutfitSkin },
  paint: (color: string, blocks: [number, number, number, number][]) => void,
): void;
export function drawWritingHands(
  frame: number,
  paint: (color: string, blocks: [number, number, number, number][]) => void,
): void;
export function hasPropArt(name: string): name is PropName;
export function drawProp(
  name: PropName,
  paint: (color: string, x: number, y: number) => void,
): void;
