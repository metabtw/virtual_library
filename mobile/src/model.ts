export type Gender = 'unspecified' | 'female' | 'male';
export type Avatar = { gender: Gender; hair: number; outfit: number; color: string };
export type DeskStatus = 'desk' | 'break';
export type AmbienceTrack = 'rain' | 'fire' | 'cafe' | 'lofi' | 'space' | 'forest';
export type Volume = 0 | 1 | 2 | 3;
export type ItemId = 'lamp' | 'plant' | 'cat' | 'sweater' | 'goldKeys' | 'dragon' | 'neon' | 'space' | 'forest';
export type Item = { id: ItemId; name: string; name_en: string; price: number; kind?: 'desk' | 'wearable' | 'rare' | 'ambience' };
export type Pet = { xp: number; upset: boolean };
export type Drop = { item: ItemId } | { coins: number };
export type Member = { own: boolean; name: string; status: DeskStatus; avatar: Avatar; placed: ItemId[]; target?: string; pet?: Pet | null };
export type Profile = { name: string; coins: number; room: string | null; status: DeskStatus | null; avatar: Avatar; target?: string };
export type Room = { id: string; name: string; name_en: string; count: number; capacity: number; private?: boolean; invite?: string | null; targets?: string[]; minutes?: number };
export type Focus = {
  start: number; end: number; checks: number; state: 'active' | 'completed' | 'invalid';
  paused_at: number | null; verification_due: number | null;
};

export type Snapshot = {
  now: number;
  profile: Profile | null;
  rooms: Room[];
  members: Member[];
  items: Item[];
  inventory: { item: ItemId; placed: boolean }[];
  session: Focus | null;
  pet?: Pet | null;
  chests?: number;
  drop?: Drop | null;
};

export type Command = {
  profile: Avatar & { name: string };
  join: { room: string };
  leave: undefined;
  status: { status: DeskStatus };
  start: { duration: number };
  verify: undefined;
  buy: { item: ItemId };
  place: { item: ItemId };
  target: { target: string };
  createRoom: { name: string };
  joinCode: { code: string };
  openBox: undefined;
  openChest: undefined;
  abandon: undefined;
};
