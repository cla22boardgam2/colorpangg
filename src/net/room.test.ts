import { describe, expect, test } from 'vitest';
import { makeRng } from '../game/deck';
import { startGame } from '../game/rules';
import type { LobbyState } from './protocol';
import { acceptSnapshot, claimSeat, electHost, HOST_TIMEOUT_MS, newRoomCode, rebaseTurnStart, seatOf } from './room';

const lobby = (seats: LobbyState['seats'] = {}, started = false): LobbyState => ({ version: 1, hostId: 'h', seats, started });
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
    const seen = { h: { seat: 3, at: now - 1000 }, a: { seat: 1, at: now } };
    expect(electHost(seen, 'h', now)).toBe('h');
  });

  test('electHost picks lowest live seat after 6s', () => {
    const seen = {
      h: { seat: 1, at: now - HOST_TIMEOUT_MS - 1 },
      b: { seat: 4, at: now },
      a: { seat: 2, at: now - 100 },
      x: { seat: null, at: now },
    };
    expect(electHost(seen, 'h', now)).toBe('a');
  });

  test('electHost ignores stale peers', () => {
    const seen = {
      h: { seat: 1, at: now - 7000 },
      a: { seat: 2, at: now - 9000 },
      b: { seat: 3, at: now - 10 },
    };
    expect(electHost(seen, 'h', now)).toBe('b');
  });

  test('electHost falls back to seatless peers by id', () => {
    const seen = { h: { seat: null, at: now - 9000 }, y: { seat: null, at: now }, x: { seat: null, at: now } };
    expect(electHost(seen, 'h', now)).toBe('x');
  });
});

describe('snapshots', () => {
  test('acceptSnapshot ignores stale versions', () => {
    expect(acceptSnapshot(null, game(1))).toBe(true);
    expect(acceptSnapshot(game(5), game(6))).toBe(true);
    expect(acceptSnapshot(game(5), game(5))).toBe(false);
    expect(acceptSnapshot(game(5), game(4))).toBe(false);
  });

  test('rebaseTurnStart keeps remaining time', () => {
    const s = { ...game(1), turnStartedAt: 500 };
    expect(rebaseTurnStart(s, 1000, 51000).turnStartedAt).toBe(50500);
    expect(s.turnStartedAt).toBe(500);
  });
});
