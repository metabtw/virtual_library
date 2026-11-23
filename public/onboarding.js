export const tourSteps = [
  { title: 'tourRooms', body: 'tourRoomsBody', art: 'classic' },
  { title: 'tourPrivate', body: 'tourPrivateBody', art: 'rain' },
  { title: 'tourInventory', body: 'tourInventoryBody', art: 'garden' },
  { title: 'tourQuests', body: 'tourQuestsBody', art: 'aurora' },
];

export const loadingPixels = Array.from({ length: 16 }, (_, index) => ({
  x: Math.round(96 + Math.sin(index * Math.PI / 8) * 85),
  y: Math.round(96 - Math.cos(index * Math.PI / 8) * 85),
  opacity: 0.16 + index * 0.056,
}));
