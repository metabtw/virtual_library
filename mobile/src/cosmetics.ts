import type { HairSkin, OutfitSkin, PropName } from '../../public/avatar-art';
import type { Avatar, ItemId } from './model';

export type AvatarLook = Avatar & { hairSkin?: HairSkin; outfitSkin?: OutfitSkin };

export const shopHair: readonly HairSkin[] = ['copperCurls', 'silverBraid', 'midnightFade'];
export const shopOutfits: readonly OutfitSkin[] = ['auroraHood', 'archiveVest', 'moonCoat'];

export const deskArt: Partial<Record<ItemId, PropName>> = {
  lamp: 'lamp',
  cat: 'catSleep',
  goldKeys: 'goldKeys',
  dragon: 'dragon',
  neon: 'neon',
  teaSet: 'teaSet',
  hourglass: 'hourglass',
  miniGlobe: 'miniGlobe',
  crystalTerrarium: 'crystalTerrarium',
};

export function dressedAvatar(avatar: Avatar, equipped: readonly ItemId[]): AvatarLook {
  const outfitSkin = shopOutfits.find(skin => equipped.includes(skin));
  const hairSkin = shopHair.find(skin => equipped.includes(skin));
  const base = !outfitSkin && equipped.includes('sweater')
    ? { ...avatar, outfit: 0, color: '#d88b47' }
    : avatar;
  return { ...base, outfitSkin, hairSkin };
}
