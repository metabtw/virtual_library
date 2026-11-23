const themes = new Map([
  ['night', 'classic'], ['garden', 'garden'], ['archive', 'old-archive'],
  ['rain-terrace', 'rain-terrace'], ['aurora-observatory', 'aurora-observatory'], ['japanese-garden', 'japanese-garden'],
  ['mathematics', 'mathematics'], ['history', 'history'], ['science', 'science'],
  ['literature', 'literature'], ['languages', 'languages'], ['art', 'art'],
]);

export const themedBackdrops = [
  'rain', 'garden', 'stars', 'old-archive', 'rain-terrace', 'aurora-observatory', 'japanese-garden',
  'mathematics', 'history', 'science', 'literature', 'languages', 'art',
];

export function defaultRoomTheme(room, aurora = false) {
  return themes.get(room) ?? (aurora ? 'aurora' : 'classic');
}

export function roomBackdrop(theme) {
  if (theme === 'classic') return '/library.webp';
  if (theme === 'aurora') return '/aurora.webp';
  return '/room-themes/' + theme + '.webp';
}
