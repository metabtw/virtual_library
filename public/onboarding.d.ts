export const tourSteps: readonly (
  | { title: 'tourRooms'; body: 'tourRoomsBody'; art: 'classic' }
  | { title: 'tourPrivate'; body: 'tourPrivateBody'; art: 'rain' }
  | { title: 'tourInventory'; body: 'tourInventoryBody'; art: 'garden' }
  | { title: 'tourQuests'; body: 'tourQuestsBody'; art: 'aurora' }
)[];
export const loadingPixels: readonly { x: number; y: number; opacity: number }[];
