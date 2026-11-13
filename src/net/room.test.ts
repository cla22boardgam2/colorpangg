import { describe, expect, test } from 'vitest';
import { makeRng } from '../game/deck';
import { startGame } from '../game/rules';
import type { LobbyState } from './protocol';
import {
  canElect,
  claimSeat,
  createIdFactory,
  electHost,
  HOST_TIMEOUT_MS,
  lobbyIsNewer,
  newRoomCode,
  rebaseTurnStart,
  seatOf,
  snapshotIsNewer,
} from './room';

const lobby = (seats: LobbyState['seats'] = {}, started = false): LobbyState => ({ version: 1, term: 1, hostId: 'h', seats, started });
const game = (version: number) => ({
  ...startGame([{ seat: 1, name: 'a', clientId: 'a' }, { seat: 2, name: 'b', clientId: 'b' }], makeRng(1), 500),
  version,
});

describe('room code', () => {
  test('newRoomCode is 6 digits', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 200; i++) expect(newRoomCode(rng)).toMatch(/^\d{6}$/);
    expect(newRoomCode(() => 0)).toBe('000000');
  });
});

describe('claimSeat', () => {
  test('claimSeat rejects taken seat', () => {
    const l = lobby({ 1: { name: '민수', clientId: 'a' } });
    const r = claimSeat(l, 'b', 1, '영희');
    expect(r.ok).toBe(false);
  });

  test('claimSeat moves own seat before start', () => {
    const l = lobby({ 1: { name: '민수', clientId: 'a' } });
    const r = claimSeat(l, 'a', 3, '민수');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lobby.seats[1]).toBeUndefined();
      expect(r.lobby.seats[3]).toEqual({ name: '민수', clientId: 'a' });
      expect(r.lobby.version).toBe(2);
      expect(seatOf(r.lobby, 'a')).toBe(3);
    }
  });

  test('claimSeat restores same client', () => {
    const l = lobby({ 2: { name: '민수', clientId: 'a' } }, true);
    const r = claimSeat(l, 'a', 2, '민수');
    expect(r.ok).toBe(true);
  });

  test('claimSeat rejects newcomer during game', () => {
    const l = lobby({ 2: { name: '민수', clientId: 'a' } }, true);
    const r = claimSeat(l, 'z', 3, '지훈');
    expect(r).toEqual({ ok: false, reason: '이미 시작된 방이에요' });
  });

  test('claimSeat rejects seat 5', () => {
    expect(claimSeat(lobby(), 'a', 5, '민수').ok).toBe(false);
    expect(claimSeat(lobby(), 'a', 0, '민수').ok).toBe(false);
  });
});

describe('electHost', () => {
  const now = 100_000;
  test('electHost keeps live host', () => {
    const seen = { h: { seat: 3, at: now - 1000, isHost: true }, a: { seat: 1, at: now, isHost: false } };
    expect(electHost(seen, 'h', now)).toBe('h');
  });

  test('electHost picks lowest live seat after 6s', () => {
    const seen = {
      h: { seat: 1, at: now - HOST_TIMEOUT_MS - 1, isHost: true },
      b: { seat: 4, at: now, isHost: false },
      a: { seat: 2, at: now - 100, isHost: false },
      x: { seat: null, at: now, isHost: false },
    };
    expect(electHost(seen, 'h', now)).toBe('a');
  });

  test('electHost ignores stale peers', () => {
    const seen = {
      h: { seat: 1, at: now - 7000, isHost: true },
      a: { seat: 2, at: now - 9000, isHost: false },
      b: { seat: 3, at: now - 10, isHost: false },
    };
    expect(electHost(seen, 'h', now)).toBe('b');
  });

  test('seatless peers never take over', () => {
    const seen = { h: { seat: 1, at: now - 9000, isHost: true }, x: { seat: null, at: now, isHost: false } };
    expect(electHost(seen, 'h', now)).toBe('h');
  });

  test('host that reloaded and no longer claims host is replaced', () => {
    const seen = { h: { seat: 1, at: now, isHost: false }, a: { seat: 2, at: now, isHost: false } };
    expect(electHost(seen, 'h', now)).toBe('a');
  });
});

describe('election guard', () => {
  test('canElect only after being stable for 6s', () => {
    expect(canElect(10_000, 10_000 - HOST_TIMEOUT_MS)).toBe(false);
    expect(canElect(10_000, 10_000 - HOST_TIMEOUT_MS - 1)).toBe(true);
  });
});

describe('message ids', () => {
  test('a new channel for the same client never reuses ids', () => {
    const first = createIdFactory('c1');
    const second = createIdFactory('c1');
    const a = [first(), first(), first()];
    const b = [second(), second(), second()];
    expect(new Set([...a, ...b]).size).toBe(6);
  });
});

describe('lobby ordering', () => {
  const base: LobbyState = {
    version: 5,
    term: 2,
    hostId: 'a',
    started: true,
    seats: { 1: { name: 'A', clientId: 'a' }, 2: { name: 'B', clientId: 'b' }, 3: { name: 'C', clientId: 'c' } },
  };
  test('higher term wins even with lower version', () => {
    expect(lobbyIsNewer(base, { ...base, term: 3, version: 1, hostId: 'b' })).toBe(true);
    expect(lobbyIsNewer(base, { ...base, term: 1, version: 99, hostId: 'b' })).toBe(false);
  });
  test('same host: higher version wins', () => {
    expect(lobbyIsNewer(base, { ...base, version: 6 })).toBe(true);
    expect(lobbyIsNewer(base, { ...base, version: 5 })).toBe(false);
    expect(lobbyIsNewer(null, base)).toBe(true);
  });
  test('two hosts in the same term: lower seat host wins on both sides', () => {
    const fromB = { ...base, hostId: 'b', version: 9 };
    const fromC = { ...base, hostId: 'c', version: 2 };
    expect(lobbyIsNewer(fromC, fromB)).toBe(true);
    expect(lobbyIsNewer(fromB, fromC)).toBe(false);
  });
});

describe('snapshots', () => {
  test('snapshotIsNewer orders by term then version', () => {
    expect(snapshotIsNewer(null, { term: 1, version: 1 })).toBe(true);
    expect(snapshotIsNewer({ term: 1, version: 5 }, { term: 1, version: 6 })).toBe(true);
    expect(snapshotIsNewer({ term: 1, version: 5 }, { term: 1, version: 5 })).toBe(false);
    expect(snapshotIsNewer({ term: 1, version: 5 }, { term: 1, version: 4 })).toBe(false);
    expect(snapshotIsNewer({ term: 1, version: 50 }, { term: 2, version: 3 })).toBe(true);
    expect(snapshotIsNewer({ term: 2, version: 3 }, { term: 1, version: 50 })).toBe(false);
  });

  test('rebaseTurnStart keeps remaining time', () => {
    const s = { ...game(1), turnStartedAt: 500 };
    expect(rebaseTurnStart(s, 1000, 51000).turnStartedAt).toBe(50500);
    expect(s.turnStartedAt).toBe(500);
  });
});
