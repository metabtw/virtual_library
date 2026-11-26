type StepName = 'Rooms' | 'Private' | 'Focus' | 'Inventory' | 'Friends' | 'Calendar' | 'Shop' | 'Quests' | 'Games' | 'Account';
export const tourSteps: readonly {
  image: 'rooms' | 'private' | 'focus' | 'avatar' | 'friends' | 'planner' | 'shop' | 'quests' | 'games' | 'account';
  title: `tour${StepName}`;
  body: `tour${StepName}Body`;
}[];
export const loadingPixels: readonly { x: number; y: number; opacity: number }[];
