import type { Action, GameState } from '../game/types';

export interface Seat {
  name: string;
  clientId: string;
}

export interface LobbyState {
  version: number;
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
  | { type: 'SNAPSHOT'; hostId: string; state: GameState; sentAt: number }
  | { type: 'HEARTBEAT'; clientId: string; seat: number | null; isHost: boolean; version: number; sentAt: number }
  | { type: 'REJECT'; clientId: string; reason: string };
