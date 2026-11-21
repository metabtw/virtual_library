import type { AvatarFeatures, PetItem } from '../../public/avatar-art';
import type { DeskActivity } from '../../public/desk-status';

export type Gender = 'unspecified' | 'female' | 'male';
export type Avatar = AvatarFeatures & { gender: Gender; hair: number; outfit: number; color: string };
export type DeskStatus = 'desk' | 'break';
export type AmbienceTrack = 'rain' | 'fire' | 'cafe' | 'lofi' | 'space' | 'forest';
export type Volume = 0 | 1 | 2 | 3;
export type ItemId =
  | 'lamp' | 'plant' | PetItem | 'sweater' | 'goldKeys' | 'neon' | 'space' | 'forest'
  | 'auroraHood' | 'archiveVest' | 'moonCoat' | 'copperCurls' | 'silverBraid' | 'midnightFade'
  | 'teaSet' | 'hourglass' | 'miniGlobe' | 'crystalTerrarium'
  | 'autumnPoncho' | 'starlightJacket' | 'mossOveralls' | 'lavenderBuns' | 'mintBob'
  | 'mushroomLamp' | 'foxMug' | 'retroRadio' | 'jellyTank' | 'origamiCrane';
export type ItemKind = 'desk' | 'wearable' | 'hair' | 'rare' | 'ambience' | 'pet';
export type Item = { id: ItemId; name: string; name_en: string; price: number; kind: ItemKind };
export type ThemeChoice = 'auto' | 'classic' | 'rain' | 'garden' | 'stars';
export type Pet = { xp: number; upset: boolean };
export type Drop = { item: ItemId } | { coins: number };
export type ReactionKind = 'coffee' | 'clap';
export type DeskReaction = { id: string; kind: ReactionKind; name: string };
export type Member = { own: boolean; desk_ref?: string; name: string; status: DeskStatus; activity?: DeskActivity; avatar: Avatar; placed: ItemId[]; target?: string; pet?: Pet | null };
export type Profile = { name: string; coins: number; room: string | null; status: DeskStatus | null; avatar: Avatar; target?: string;
  readerCode?: string; referralCode?: string };
export type Room = { id: string; name: string; name_en: string; count: number; capacity: number; private?: boolean; invite?: string | null; targets?: string[]; minutes?: number };
export type Focus = {
  start: number; end: number; checks: number; state: 'active' | 'completed' | 'invalid';
  paused_at: number | null; next_check_at?: number | null; check_until?: number | null;
};
export type Friend = { id: string; name: string; code: string; status: 'accepted' | 'sent' | 'incoming' };
export type StudyInvite = { id: string; name: string; room: string; room_en: string; private: boolean };
export type DailyQuests = { date: string; minutes: number; goals: { minutes: number; coins: number; completed: boolean }[] };
export type Answer = 'accept' | 'reject';

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
  reactions?: DeskReaction[];
  dailyQuests?: DailyQuests;
  friends?: Friend[];
  studyInvites?: StudyInvite[];
  joinedInvite?: boolean;
  adRetryAt?: number;
  adPlatforms?: Partial<Record<'web' | 'android' | 'ios', boolean>>;
};

export type StudySummary = { date: string; minutes: number; streak: number };
export type Leaderboard = {
  starts: string; ends: string; visible: boolean;
  own: { rank: number; minutes: number } | null;
  rows: { rank: number; minutes: number; name: string }[];
};

export type Command = {
  profile: Avatar & { name: string; referral?: string };
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
  react: { desk: string; kind: ReactionKind };
  rankingVisibility: { visible: boolean };
  addFriend: { code: string };
  answerFriend: { id: string; answer: Answer };
  removeFriend: { id: string };
  inviteFriend: { id: string };
  answerStudyInvite: { id: string; answer: Answer };
};
