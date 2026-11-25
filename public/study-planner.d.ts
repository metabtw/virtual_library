export type StudyDraft = { id?: string; day: string; topic: string; minutes: number; questions: number;
  logged_minutes: number; solved: number; notes: string; reminder: string };
export type StudyPlan = Omit<StudyDraft,'reminder'> & { id: string; reminder: string | null; reminderAt: number | null };
export type StudySession = { id: string; topic: string | null; planId: string | null; day: string; minutes: number; endsAt: number };
export type StudyCalendar = { today: string; month: string; plans: StudyPlan[]; sessions: StudySession[] };
export const plannerTimezone: string;
export function plannerToday(time?: number): string;
export function changeMonth(month: string, offset: number): string;
export function monthCells(month: string): (string | null)[];
export function dayLabel(day: string, locale: string, monthOnly?: boolean): string;
export function dayActivity(calendar: StudyCalendar | undefined, day: string): {
  plans: StudyPlan[]; sessions: StudySession[]; recorded: number; minutes: number; target: number; solved: number; questions: number;
};
export function newPlan(day: string): StudyDraft;
