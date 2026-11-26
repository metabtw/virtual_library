export const tourSteps = [
  ['rooms', 'Rooms'], ['private', 'Private'], ['focus', 'Focus'], ['verify', 'Verify'], ['break', 'Break'],
  ['coins', 'Coins'], ['quests', 'Quests'], ['goal', 'Goal'], ['shop', 'Shop'], ['chests', 'Chests'],
  ['avatar', 'Inventory'], ['friends', 'Friends'], ['planner', 'Calendar'], ['games', 'Games'], ['account', 'Account'],
].map(([image, name]) => ({ image, title: 'tour' + name, body: 'tour' + name + 'Body' }));

export const loadingPixels = Array.from({ length: 16 }, (_, index) => ({
  x: Math.round(96 + Math.sin(index * Math.PI / 8) * 85),
  y: Math.round(96 - Math.cos(index * Math.PI / 8) * 85),
  opacity: 0.16 + index * 0.056,
}));
