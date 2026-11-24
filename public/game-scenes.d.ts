import type { Direction, GameId } from './study-games.js';
import type { RoomBackdrop } from './room-art.js';

export const gameArt: Record<GameId, { room: RoomBackdrop; icon: number; accent: string; edge: string }>;
export const atlasColumns: number;
export const atlasRows: number;
export type GameNode = {
  key: string; art: number; x: number; y: number; width: number; height: number;
  opacity?: number; rotate?: number; scale?: number; glow?: number; level?: number; color?: string;
};
export type GameFrame = {
  nodes: GameNode[];
  score: number;
  done: boolean;
  active?: boolean;
  disabled?: boolean;
  hits?: number;
  shift?: number;
  notice?: boolean;
  guide?: { x: number; y: number; width: number; height: number; aligned: boolean };
};
export type GameInput = Direction | 'drop' | 'hold' | 'release';
export function createGameRound(id: GameId): {
  input(command: GameInput): void;
  step(seconds: number): boolean;
  frame(reduced?: boolean): GameFrame;
};
