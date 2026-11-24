export const gameIds: readonly ['tower', 'merge', 'glide'];
export type GameId = typeof gameIds[number];
export type Direction = 'left' | 'up' | 'down' | 'right';
export function gameText(locale: string): {
  titles: Record<GameId, string>; help: Record<GameId, string>; directions: Record<Direction, string>; items: string[];
  controls: string; aligned: string; chapters: Record<GameId, string>;
  restart: string; drop: string; lift: string; score: string; books: string; hits: string; ended: string; start: string;
};
export type Tower = { books: { x: number; width: number }[]; x: number; width: number; direction: number; done: boolean };
export function newTower(): Tower;
export function tickTower(game: Tower, seconds: number): Tower;
export function dropBook(game: Tower): Tower;
export type Merge = { board: number[]; score: number; done: boolean; motion?: {
  travel: { from: number; to: number; level: number }[]; combinations: number[]; spawned: number | null;
} };
export function newMerge(random?: () => number): Merge;
export function slideMerge(game: Merge, direction: Direction, random?: () => number): Merge;
export type Glide = { active: boolean; y: number; velocity: number; hits: number; score: number; gates: {
  x: number; gap: number; hit: boolean; collected: boolean;
}[] };
export function newGlide(): Glide;
export function glideSpeed(hits: number): number;
export function tickGlide(game: Glide, held: boolean, seconds: number, random?: () => number): Glide;
