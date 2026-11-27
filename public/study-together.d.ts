import type { AvatarFeatures } from './avatar-art.js';
export type Meet = { id: string; topic: string; startsAt: number; minutes: number; host: string;
  room: string; roomEn: string; owner: boolean; joined: boolean; remind: boolean };
export type PairAvatar = AvatarFeatures & {
  gender: 'unspecified' | 'female' | 'male'; hair: number; outfit: number; color: string;
};
export type PairGoal = { id: string; friend: string; week: string; target: number; progress: number;
  invite: boolean; own: boolean; avatarAllowed: boolean; partnerAvatar: PairAvatar | null };
export type Together = { meets: Meet[]; rooms: { id: string; name: string; nameEn: string }[];
  friends: { id: string; name: string }[]; goals: PairGoal[] };
export type WeekSummary = { starts: string; ends: string; minutes: number; topics: string[] };
export function readMeetId(value: unknown): string | null;
export function meetLink(id: string, origin?: string): string;
export function meetTimestamp(day: string, time: string): number;
export function localMeetInput(date: Date): string;
export function meetDate(startsAt: number, locale: string): string;
export function meetPhase(meet: Meet, now?: number): 'upcoming' | 'open' | 'ended';
export function shareMeetText(meet: Meet, locale: string, origin?: string): string;
