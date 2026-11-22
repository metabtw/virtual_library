import type { HairSkin, OutfitSkin } from '../../public/avatar-art';
import type { Avatar } from './model';

export type AvatarLook = Avatar & { hairSkin?: HairSkin; outfitSkin?: OutfitSkin };

export { dressedAvatar } from '../../public/avatar-art';
