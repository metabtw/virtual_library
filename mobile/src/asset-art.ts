import type { Gender, ItemId } from './model';

export const avatarAssets: Record<Gender, number> = {
  unspecified: require('../assets/avatars/reader.png'),
  female: require('../assets/avatars/long-waves.png'),
  male: require('../assets/avatars/side-part.png'),
};

export const itemAssets: Record<ItemId, number> = {
  lamp: require('../assets/items/lamp.png'),
  plant: require('../assets/items/plant.png'),
  cat: require('../assets/items/cat.png'),
  sweater: require('../assets/items/sweater.png'),
  goldKeys: require('../assets/items/goldKeys.png'),
  dragon: require('../assets/items/dragon.png'),
  neon: require('../assets/items/neon.png'),
  space: require('../assets/items/space.png'),
  forest: require('../assets/items/forest.png'),
  auroraHood: require('../assets/items/auroraHood.png'),
  archiveVest: require('../assets/items/archiveVest.png'),
  moonCoat: require('../assets/items/moonCoat.png'),
  copperCurls: require('../assets/items/copperCurls.png'),
  silverBraid: require('../assets/items/silverBraid.png'),
  midnightFade: require('../assets/items/midnightFade.png'),
  teaSet: require('../assets/items/teaSet.png'),
  hourglass: require('../assets/items/hourglass.png'),
  miniGlobe: require('../assets/items/miniGlobe.png'),
  crystalTerrarium: require('../assets/items/crystalTerrarium.png'),
  autumnPoncho: require('../assets/items/autumnPoncho.png'),
  starlightJacket: require('../assets/items/starlightJacket.png'),
  mossOveralls: require('../assets/items/mossOveralls.png'),
  lavenderBuns: require('../assets/items/lavenderBuns.png'),
  mintBob: require('../assets/items/mintBob.png'),
  mushroomLamp: require('../assets/items/mushroomLamp.png'),
  foxMug: require('../assets/items/foxMug.png'),
  retroRadio: require('../assets/items/retroRadio.png'),
  jellyTank: require('../assets/items/jellyTank.png'),
  origamiCrane: require('../assets/items/origamiCrane.png'),
};
