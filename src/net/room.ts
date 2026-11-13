import type { GameState } from '../game/types';
import type { LobbyState } from './protocol';

export const HEARTBEAT_MS = 2_000;
export const HOST_TIMEOUT_MS = 6_000;
export const MAX_PLAYERS = 4;

export function newRoomCode(rng: () => number): string {
  return String(Math.floor(rng() * 1_000_000)).padStart(6, '0');
}

export function seatOf(lobby: LobbyState, clientId: string): number | null {
  for (const [seat, s] of Object.entries(lobby.seats)) if (s.clientId === clientId) return Number(seat);
  return null;
}

export function claimSeat(
  lobby: LobbyState,
  clientId: string,
  seat: number,
  name: string,
): { ok: true; lobby: LobbyState } | { ok: false; reason: string } {
  if (!Number.isInteger(seat) || seat < 1 || seat > MAX_PLAYERS) return { ok: false, reason: '없는 자리예요' };
  const mine = seatOf(lobby, clientId);
  if (lobby.started) {
    if (mine === null) return { ok: false, reason: '이미 시작된 방이에요' };
    return { ok: true, lobby }; // 재입장: 원래 자리 그대로
  }
  const taken = lobby.seats[seat];
  if (taken && taken.clientId !== clientId) return { ok: false, reason: '이미 다른 친구가 앉은 자리예요' };
  const seats = { ...lobby.seats };
  if (mine !== null) delete seats[mine];
  seats[seat] = { name: name.trim() || `친구${seat}`, clientId };
  return { ok: true, lobby: { ...lobby, seats, version: lobby.version + 1 } };
}

export function leaveSeat(lobby: LobbyState, clientId: string): LobbyState {
  const mine = seatOf(lobby, clientId);
  if (mine === null || lobby.started) return lobby;
  const seats = { ...lobby.seats };
  delete seats[mine];
  return { ...lobby, seats, version: lobby.version + 1 };
}

/** 현재 심판이 살아 있으면 유지, 아니면 살아 있는 사람 중 자리 번호가 가장 빠른 사람 (자리 없는 사람은 뒤, 동률은 id 순) */
export function electHost(
  lastSeen: Record<string, { seat: number | null; at: number }>,
  currentHostId: string,
  now: number,
): string {
  const alive = (id: string) => lastSeen[id] !== undefined && now - lastSeen[id].at <= HOST_TIMEOUT_MS;
  if (alive(currentHostId)) return currentHostId;
  const candidates = Object.keys(lastSeen)
    .filter(alive)
    .sort((a, b) => {
      const sa = lastSeen[a].seat ?? Infinity;
      const sb = lastSeen[b].seat ?? Infinity;
      if (sa !== sb) return sa - sb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  return candidates[0] ?? currentHostId;
}

export function acceptSnapshot(current: GameState | null, incoming: GameState): boolean {
  return current === null || incoming.version > current.version;
}

/** 심판 기기 시각 기준 turnStartedAt을 받은 기기 시각으로 옮김 */
export function rebaseTurnStart(state: GameState, sentAt: number, receivedAt: number): GameState {
  return { ...state, turnStartedAt: state.turnStartedAt + (receivedAt - sentAt) };
}
