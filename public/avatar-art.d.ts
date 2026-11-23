type Gender = 'unspecified' | 'female' | 'male';
type Labels = Record<'tr' | 'en', readonly string[]>;
export type HairSkin = 'copperCurls' | 'silverBraid' | 'midnightFade' | 'lavenderBuns' | 'mintBob' | 'twinBraids' | 'shortWaves' | 'sideSwept' | 'highPonytail' | 'curlyFringe';
export type OutfitSkin = 'auroraHood' | 'archiveVest' | 'moonCoat' | 'autumnPoncho' | 'starlightJacket' | 'mossOveralls' | 'denimJacket' | 'stripedCardigan' | 'linenShirt' | 'raincoat' | 'boatNeckSweater';
export type PetItem = 'cat' | 'dragon' | 'pinkRabbit' | 'pugPup' | 'yellowChick' | 'arcticFox';
export type DeskPropName =
  | 'lamp' | 'neon' | 'mushroomLamp' | 'goldKeys' | 'plant' | 'teaSet' | 'hourglass' | 'foxMug' | 'retroRadio'
  | 'miniGlobe' | 'crystalTerrarium' | 'jellyTank' | 'origamiCrane'
  | 'brassLamp' | 'deskCalendar' | 'pottedCactus' | 'recordPlayer' | 'zenGarden'
  | 'moonstoneLamp' | 'rainbowPrism' | 'moonGlobe' | 'clockworkOwl';
export type PropName =
  | Exclude<DeskPropName, 'plant'> | PetItem | 'leaves' | 'pot' | 'catSleep' | 'catUpset' | 'space' | 'forest' | 'shore'
  | 'jellyTankBase' | 'jellyTankDrift';
export type AvatarFeatures = {
  hair_style?: number | null;
  outfit_style?: number | null;
  skin_tone?: number;
  hair_color?: number;
  beard?: number;
};
type BaseAvatar = AvatarFeatures & { gender?: Gender; hair: number; outfit: number; color: string };
export type AvatarPose = 'seated' | 'standing';

export const avatarSize: { width: number; height: number };
export const standingAvatarSize: { width: number; height: number };
export const writingSize: { width: number; height: number; frames: number };
export const hairStyles: Record<Gender, Labels>;
export const avatarOptions: Record<'outfit' | 'skin_tone' | 'hair_color' | 'beard', Labels>;
export const defaultAvatar: BaseAvatar & { gender: Gender };
export const avatarPresets: readonly { id: string; tr: string; en: string; look: BaseAvatar & { gender: Gender } }[];
export function pickAvatarStyle<T extends BaseAvatar>(avatar: T, field: 'hair' | 'outfit', value: number): T;
export function dressedAvatar<T extends BaseAvatar>(avatar: T, equipped: readonly string[]): T & {
  hairSkin?: HairSkin; outfitSkin?: OutfitSkin;
};
export function drawAvatar(
  avatar: BaseAvatar & { hairSkin?: HairSkin; outfitSkin?: OutfitSkin },
  paint: (color: string, blocks: [number, number, number, number][]) => void,
  pose?: AvatarPose,
): void;
export function drawWritingHands(
  frame: number,
  paint: (color: string, blocks: [number, number, number, number][]) => void,
  skinTone?: number,
): void;
export function deskEquipment(equipped: readonly string[]): { props: (DeskPropName | undefined)[]; pet?: PetItem };
export function petAppearance(pet: PetItem, progress?: { xp: number; upset: boolean } | null): {
  art: PetItem | 'catSleep' | 'catUpset'; rests: boolean;
};
export function hasPropArt(name: string): name is PropName;
export function drawProp(
  name: PropName,
  paint: (color: string, x: number, y: number) => void,
): void;
