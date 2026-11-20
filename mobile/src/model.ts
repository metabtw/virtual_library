export type Gender = 'unspecified' | 'female' | 'male';
export type Avatar = { gender: Gender; hair: number; outfit: number; color: string };
export type DeskStatus = 'desk' | 'break';
export type ItemId = 'lamp' | 'plant' | 'cat' | 'sweater';
export type Item = { id: ItemId; name: string; name_en: string; price: number };
export type Member = { own: boolean; name: string; status: DeskStatus; avatar: Avatar; placed: ItemId[] };
export type Profile = { name: string; coins: number; room: string | null; status: DeskStatus | null; avatar: Avatar };
export type Room = { id: string; name: string; name_en: string; count: number; capacity: number };
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
};
