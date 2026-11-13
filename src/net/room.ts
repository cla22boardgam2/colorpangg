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

export interface Seen {
  seat: number | null;
  at: number;
  isHost: boolean;
}

/**
 * 현재 심판이 '심판이라고 말하며' 6초 안에 보였으면 유지.
 * 아니면 (물러난 심판을 빼고) 6초 안에 보인 사람 중 자리가 있는 사람 가운데 자리 번호가 가장 빠른 사람.
 * 자리 없는 사람(관전·입장 중)은 심판이 되지 않음.
 */
export function electHost(lastSeen: Record<string, Seen>, currentHostId: string, now: number): string {
  const alive = (id: string) => lastSeen[id] !== undefined && now - lastSeen[id].at <= HOST_TIMEOUT_MS;
  if (alive(currentHostId) && lastSeen[currentHostId].isHost) return currentHostId;
  const candidates = Object.keys(lastSeen)
    .filter((id) => id !== currentHostId && alive(id) && lastSeen[id].seat !== null)
    .sort((a, b) => lastSeen[a].seat! - lastSeen[b].seat! || (a < b ? -1 : a > b ? 1 : 0));
  return candidates[0] ?? currentHostId;
}

/** 연결이 안정된 지(접속·재연결·화면 깨어남 이후) 6초가 지나야 심판 이어받기를 시도 */
export function canElect(now: number, stableSince: number): boolean {
  return now - stableSince > HOST_TIMEOUT_MS;
}

/** 채널마다 다른 nonce를 붙여, 같은 clientId로 다시 들어와도 메시지 id가 겹치지 않게 함 */
export function createIdFactory(clientId: string, nonce: string = Math.random().toString(36).slice(2, 10)): () => string {
  let seq = 0;
  return () => `${clientId}:${nonce}:${++seq}`;
}

/** (term, version) 순. 같은 기수에 심판이 둘이면 자리 번호가 빠른 심판 쪽이 이김 */
export function lobbyIsNewer(current: LobbyState | null, incoming: LobbyState): boolean {
  if (!current) return true;
  if (incoming.term !== current.term) return incoming.term > current.term;
  if (incoming.hostId !== current.hostId) {
    const si = seatOf(incoming, incoming.hostId) ?? Infinity;
    const sc = seatOf(current, current.hostId) ?? Infinity;
    if (si !== sc) return si < sc;
    return incoming.hostId < current.hostId;
  }
  return incoming.version > current.version;
}

export function snapshotIsNewer(
  current: { term: number; version: number } | null,
  incoming: { term: number; version: number },
): boolean {
  if (!current) return true;
  if (incoming.term !== current.term) return incoming.term > current.term;
  return incoming.version > current.version;
}

/** 심판 기기 시각 기준 turnStartedAt을 받은 기기 시각으로 옮김 */
export function rebaseTurnStart(state: GameState, sentAt: number, receivedAt: number): GameState {
  return { ...state, turnStartedAt: state.turnStartedAt + (receivedAt - sentAt) };
}
