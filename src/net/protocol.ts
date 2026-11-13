import type { Action, GameState } from '../game/types';

export interface Seat {
  name: string;
  clientId: string;
}

export interface LobbyState {
  version: number;
  /** 심판 기수: 심판이 바뀔 때마다 +1. (term, version) 순으로 최신 판단 */
  term: number;
  hostId: string;
  seats: Record<number, Seat>;
  started: boolean;
}

export type NetMessage =
  | { type: 'HELLO'; clientId: string }
  | { type: 'CLAIM_SEAT'; clientId: string; seat: number; name: string }
  | { type: 'LEAVE_SEAT'; clientId: string }
  | { type: 'LOBBY'; lobby: LobbyState }
  | { type: 'START'; clientId: string }
  | { type: 'REMATCH'; clientId: string }
  | { type: 'ACTION'; clientId: string; action: Action }
  | { type: 'SNAPSHOT'; hostId: string; term: number; state: GameState; sentAt: number }
  | { type: 'HEARTBEAT'; clientId: string; seat: number | null; isHost: boolean; term: number; version: number; sentAt: number }
  | { type: 'REJECT'; clientId: string; reason: string };
