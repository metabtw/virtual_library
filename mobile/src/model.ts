import type { AvatarFeatures, HairSkin, OutfitSkin, PetItem } from '../../public/avatar-art';
import type { CoinAward } from '../../public/coin-notices';
import type { DeskActivity } from '../../public/desk-status';

export type Gender = 'unspecified' | 'female' | 'male';
export type Avatar = AvatarFeatures & { gender: Gender; hair: number; outfit: number; color: string };
export type DeskStatus = 'desk' | 'break';
export type AmbienceTrack = 'rain' | 'fire' | 'cafe' | 'lofi' | 'space' | 'forest' | 'shore';
export type Volume = 0 | 1 | 2 | 3;
export type ItemId =
  | 'lamp' | 'plant' | PetItem | 'sweater' | 'goldKeys' | 'neon' | 'space' | 'forest' | 'shore'
  | 'teaSet' | 'hourglass' | 'miniGlobe' | 'crystalTerrarium'
  | 'mushroomLamp' | 'foxMug' | 'retroRadio' | 'jellyTank' | 'origamiCrane'
  | HairSkin | OutfitSkin | 'brassLamp' | 'deskCalendar' | 'pottedCactus' | 'recordPlayer' | 'zenGarden'
  | 'moonstoneLamp' | 'rainbowPrism' | 'moonGlobe' | 'clockworkOwl';
export type ItemKind = 'desk' | 'wearable' | 'hair' | 'rare' | 'ambience' | 'pet';
export type Item = { id: ItemId; name: string; name_en: string; price: number; kind: ItemKind; box_only?: boolean };
export type ThemeChoice = 'auto' | 'classic' | 'rain' | 'garden' | 'stars';
export type Pet = { xp: number; upset: boolean };
export type Drop = ({ item: ItemId } | { coins: number }) & { tier?: BoxTier };
export type ReactionKind = 'coffee' | 'clap';
export type DeskReaction = { id: string; kind: ReactionKind; name: string };
export type CoffeeCup = { id: string; expiresAt: number };
export type Member = { own: boolean; desk_ref?: string; name: string; status: DeskStatus; activity?: DeskActivity; avatar: Avatar; placed: ItemId[]; pet?: Pet | null; acceptsInteractions?: boolean; friendStatus?: Friend['status'] | null; coffeeCup?: CoffeeCup | null };
export type Profile = { name: string; coins: number; room: string | null; status: DeskStatus | null; avatar: Avatar;
  readerCode?: string; referralCode?: string; shortReaderCode?: string; shortReferralCode?: string; ownsPrivateRoom?: boolean; tourPending?: boolean; doNotDisturb?: boolean };
export type Room = { id: string; name: string; name_en: string; count: number; capacity: number; private?: boolean; owned?: boolean; invite?: string | null; minutes?: number; expiresAt?: number };
export type Focus = {
  start: number; end: number; checks: number; state: 'active' | 'completed' | 'invalid';
  paused_at: number | null; next_check_at?: number | null; check_until?: number | null; disconnectDeadline?: number | null;
};
export type Friend = { id: string; name: string; code: string; shortCode?: string; status: 'accepted' | 'sent' | 'incoming'; inRoom?: boolean; inviteRetryAt?: number | null };
export type StudyInvite = { id: string; name: string; room: string; room_en: string; private: boolean; expiresAt?: number };
export type DailyQuests = { date: string; minutes: number; goals: { minutes: number; coins: number; completed: boolean }[] };
export type WeeklyQuests = { start: string; end: string; goals: {
  id: string; target: number; progress: number; unit: 'minutes' | 'days'; coins: number; completed: boolean;
}[] };
export type BoxTier = 'basic' | 'epic' | 'legendary';
export type RewardBox = { id: BoxTier; price: number; rewards: { item: ItemId; weight: number }[] };
export type Answer = 'accept' | 'reject';

export type Snapshot = {
  now: number;
  meetingMinutes?: number;
  profile: Profile | null;
  rooms: Room[];
  members: Member[];
  items: Item[];
  inventory: { item: ItemId; placed: boolean }[];
  session: Focus | null;
  autoBreak?: { id: string; endsAt: number };
  roomGoal?: import('../../public/study-rewards').RoomProgress;
  pet?: Pet | null;
  chests?: number;
  drop?: Drop | null;
  reactions?: DeskReaction[];
  coinAwards?: CoinAward[];
  plannerRemote?: boolean;
  todayPlans?: { id: string; topic: string; minutes: number; reminderAt: number | null }[];
  dailyQuests?: DailyQuests;
  weeklyQuests?: WeeklyQuests;
  boxes?: RewardBox[];
  friends?: Friend[];
  studyInvites?: StudyInvite[];
  joinedInvite?: boolean;
  adRetryAt?: number;
  adPlatforms?: Partial<Record<'web' | 'android' | 'ios', boolean>>;
};

export type StudySummary = { date: string; minutes: number; streak: number; week?: import('../../public/study-together').WeekSummary };
export type Leaderboard = {
  starts: string; ends: string; visible: boolean;
  own: { rank: number; minutes: number } | null;
  rows: { rank: number; minutes: number; name: string }[];
};

export type Command = {
  profile: Avatar & { name: string; referral?: string };
  finishTour: undefined;
  join: { room: string };
  joinStudyMeet: { id: string };
  leave: undefined;
  status: { status: DeskStatus };
  start: { duration: number; breakMinutes: number; planId?: string };
  verify: undefined;
  buy: { item: ItemId };
  place: { item: ItemId };
  roomVisibility: { room: string; public: boolean };
  createRoom: { name: string };
  joinCode: { code: string };
  openBox: { tier: BoxTier; price: number };
  openChest: undefined;
  abandon: undefined;
  react: { desk: string; kind: ReactionKind };
  rankingVisibility: { visible: boolean };
  addFriend: { code: string };
  addDeskFriend: { desk: string };
  setDoNotDisturb: { enabled: boolean };
  answerFriend: { id: string; answer: Answer };
  removeFriend: { id: string };
  inviteFriend: { id: string };
  answerStudyInvite: { id: string; answer: Answer };
};
