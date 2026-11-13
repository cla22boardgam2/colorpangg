export type Color = 'red' | 'yellow' | 'green' | 'blue';
export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];
export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  id: string;
  kind: CardKind;
  color: Color | null;
  value: number | null;
}

export type Rng = () => number;

export interface PlayerState {
  seat: number;
  name: string;
  clientId: string;
  hand: Card[];
}

export type GameEvent =
  | { kind: 'play'; seat: number; card: Card }
  | { kind: 'draw'; seat: number; count: number; forced: boolean }
  | { kind: 'callOne'; seat: number }
  | { kind: 'caught'; seat: number; by: number }
  | { kind: 'timeout'; seat: number }
  | { kind: 'win'; seat: number };

export interface GameState {
  version: number;
  phase: 'playing' | 'finished';
  players: PlayerState[]; // 자리 번호 오름차순 = 차례 순서
  drawPile: Card[];
  discard: Card[]; // 마지막 원소가 바닥 맨 위
  currentColor: Color;
  turn: number; // players 인덱스
  direction: 1 | -1;
  pendingDraw: number;
  drawnCardId: string | null;
  oneCardPending: number | null; // 자리 번호
  turnStartedAt: number;
  winner: number | null; // 자리 번호
  lastEvent: GameEvent | null;
}

export type Action =
  | { type: 'play'; seat: number; cardId: string; chosenColor?: Color }
  | { type: 'draw'; seat: number }
  | { type: 'pass'; seat: number }
  | { type: 'callOne'; seat: number }
  | { type: 'catch'; seat: number; target: number }
  | { type: 'timeout' };

export type ApplyResult = { ok: true; state: GameState } | { ok: false; reason: string };
