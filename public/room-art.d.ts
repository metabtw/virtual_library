export type RoomBackdrop = 'classic' | 'rain' | 'garden' | 'stars' | 'aurora'
  | 'old-archive' | 'rain-terrace' | 'aurora-observatory' | 'japanese-garden' | 'mathematics' | 'history' | 'science' | 'literature' | 'languages' | 'art';
export function defaultRoomTheme(room?: string | null, aurora?: boolean): RoomBackdrop;
export function roomBackdrop(theme: RoomBackdrop): string;
export const themedBackdrops: readonly RoomBackdrop[];
