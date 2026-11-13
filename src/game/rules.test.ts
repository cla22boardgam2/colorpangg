import { describe, expect, test } from 'vitest';
import { createDeck, makeRng } from './deck';
import { applyAction, canPlay, CATCH_PENALTY, currentSeat, HAND_SIZE, mostCommonColor, startGame, TURN_MS } from './rules';
import type { Action, Card, GameState } from './types';

const ALL = new Map(createDeck().map((c) => [c.id, c]));
const cards = (...ids: string[]): Card[] =>
  ids.map((id) => {
    const c = ALL.get(id);
    if (!c) throw new Error('no card ' + id);
    return c;
  });
const rng = makeRng(7);

/** 자리 1..n, 손패는 hands[i], 바닥 맨 위는 top */
function makeState(hands: string[][], top: string, partial: Partial<GameState> = {}): GameState {
  const used = new Set([...hands.flat(), top]);
  const topCard = cards(top)[0];
  return {
    version: 1,
    phase: 'playing',
    players: hands.map((h, i) => ({ seat: i + 1, name: `p${i + 1}`, clientId: `c${i + 1}`, hand: cards(...h) })),
    drawPile: createDeck().filter((c) => !used.has(c.id)),
    discard: [topCard],
    currentColor: topCard.color ?? 'red',
    turn: 0,
    direction: 1,
    pendingDraw: 0,
    drawnCardId: null,
    oneCardPending: null,
    turnStartedAt: 0,
    winner: null,
    lastEvent: null,
    ...partial,
  };
}

function ok(state: GameState, action: Action, now = 1000): GameState {
  const r = applyAction(state, action, rng, now);
  if (!r.ok) throw new Error('rejected: ' + r.reason);
  return r.state;
}
function rejected(state: GameState, action: Action, now = 1000): boolean {
  return !applyAction(state, action, rng, now).ok;
}
const handOf = (s: GameState, seat: number) => s.players.find((p) => p.seat === seat)!.hand;
const withTopOfPile = (s: GameState, id: string): GameState => ({
  ...s,
  drawPile: [cards(id)[0], ...s.drawPile.filter((c) => c.id !== id)],
});

describe('startGame', () => {
  test('startGame deals 7 each and never starts on wild4', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = startGame(
        [1, 2, 3].map((seat) => ({ seat, name: `p${seat}`, clientId: `c${seat}` })),
        makeRng(seed),
        5000,
      );
      expect(s.players.every((p) => p.hand.length === HAND_SIZE)).toBe(true);
      expect(s.discard[s.discard.length - 1].kind).not.toBe('wild4');
      const total = s.players.reduce((n, p) => n + p.hand.length, 0) + s.drawPile.length + s.discard.length;
      expect(total).toBe(108);
      expect(s.version).toBe(1);
      expect(s.turnStartedAt).toBe(5000);
    }
  });
});

describe('canPlay', () => {
  test('canPlay matches color, value or symbol', () => {
    const s = makeState([['r1a'], ['g1a']], 'r7a');
    expect(canPlay(s, cards('r2a')[0])).toBe(true);
    expect(canPlay(s, cards('b7a')[0])).toBe(true);
    expect(canPlay(s, cards('b8a')[0])).toBe(false);
    expect(canPlay(s, cards('W1')[0])).toBe(true);
    expect(canPlay(s, cards('F1')[0])).toBe(true);
    const s2 = makeState([['r1a'], ['g1a']], 'rS1');
    expect(canPlay(s2, cards('bS1')[0])).toBe(true);
    expect(canPlay(s2, cards('bR1')[0])).toBe(false);
  });
});

describe('play', () => {
  test('wild needs chosenColor', () => {
    const s = makeState([['W1', 'r2a'], ['g1a']], 'r7a');
    expect(rejected(s, { type: 'play', seat: 1, cardId: 'W1' })).toBe(true);
    const n = ok(s, { type: 'play', seat: 1, cardId: 'W1', chosenColor: 'blue' });
    expect(n.currentColor).toBe('blue');
    expect(currentSeat(n)).toBe(2);
  });

  test('rejects out-of-turn and unowned cards', () => {
    const s = makeState([['r1a', 'r2a'], ['r3a', 'r4a']], 'r7a');
    expect(rejected(s, { type: 'play', seat: 2, cardId: 'r3a' })).toBe(true);
    expect(rejected(s, { type: 'play', seat: 1, cardId: 'r3a' })).toBe(true);
  });

  test('skip skips next player', () => {
    const s = makeState([['rS1', 'r2a'], ['g1a'], ['g2a']], 'r7a');
    expect(currentSeat(ok(s, { type: 'play', seat: 1, cardId: 'rS1' }))).toBe(3);
  });

  test('reverse flips direction', () => {
    const s = makeState([['rR1', 'r2a'], ['g1a'], ['g2a']], 'r7a');
    const n = ok(s, { type: 'play', seat: 1, cardId: 'rR1' });
    expect(n.direction).toBe(-1);
    expect(currentSeat(n)).toBe(3);
  });

  test('reverse with 2 players acts as skip', () => {
    const s = makeState([['rR1', 'r2a'], ['g1a']], 'r7a');
    expect(currentSeat(ok(s, { type: 'play', seat: 1, cardId: 'rR1' }))).toBe(1);
  });

  test('draw2 stacks: draw2 on draw2 → pendingDraw 4', () => {
    let s = makeState([['rD1', 'r2a'], ['bD1', 'g1a'], ['g2a']], 'r7a');
    s = ok(s, { type: 'play', seat: 1, cardId: 'rD1' });
    expect(s.pendingDraw).toBe(2);
    s = ok(s, { type: 'play', seat: 2, cardId: 'bD1' });
    expect(s.pendingDraw).toBe(4);
    expect(currentSeat(s)).toBe(3);
  });

  test('wild4 on draw2 → pendingDraw 6', () => {
    let s = makeState([['rD1', 'r2a'], ['F1', 'g1a'], ['g2a']], 'r7a');
    s = ok(s, { type: 'play', seat: 1, cardId: 'rD1' });
    s = ok(s, { type: 'play', seat: 2, cardId: 'F1', chosenColor: 'green' });
    expect(s.pendingDraw).toBe(6);
    expect(s.currentColor).toBe('green');
  });

  test('draw2 on wild4 allowed and sets color to draw2 color', () => {
    let s = makeState([['F1', 'r2a'], ['bD1', 'g1a'], ['g2a']], 'r7a');
    s = ok(s, { type: 'play', seat: 1, cardId: 'F1', chosenColor: 'green' });
    s = ok(s, { type: 'play', seat: 2, cardId: 'bD1' });
    expect(s.pendingDraw).toBe(6);
    expect(s.currentColor).toBe('blue');
  });

  test('only draw cards playable while pendingDraw > 0', () => {
    const s = makeState([['r2a', 'W1', 'gD1'], ['g1a']], 'rD1', { pendingDraw: 2 });
    expect(rejected(s, { type: 'play', seat: 1, cardId: 'r2a' })).toBe(true);
    expect(rejected(s, { type: 'play', seat: 1, cardId: 'W1', chosenColor: 'red' })).toBe(true);
    expect(ok(s, { type: 'play', seat: 1, cardId: 'gD1' }).pendingDraw).toBe(4);
  });
});

describe('draw', () => {
  test('draw with pending takes all and passes turn', () => {
    const s = makeState([['r2a'], ['g1a']], 'rD1', { pendingDraw: 6 });
    const n = ok(s, { type: 'draw', seat: 1 });
    expect(handOf(n, 1)).toHaveLength(7);
    expect(n.pendingDraw).toBe(0);
    expect(currentSeat(n)).toBe(2);
  });

  test('drawn playable card can be played or passed; other cards blocked', () => {
    const s = withTopOfPile(makeState([['b9a', 'r2a'], ['g1a']], 'r7a'), 'r5a');
    const n = ok(s, { type: 'draw', seat: 1 });
    expect(n.drawnCardId).toBe('r5a');
    expect(currentSeat(n)).toBe(1);
    expect(rejected(n, { type: 'play', seat: 1, cardId: 'r2a' })).toBe(true);
    expect(rejected(n, { type: 'draw', seat: 1 })).toBe(true);
    const played = ok(n, { type: 'play', seat: 1, cardId: 'r5a' });
    expect(played.drawnCardId).toBeNull();
    expect(currentSeat(played)).toBe(2);
    const passed = ok(n, { type: 'pass', seat: 1 });
    expect(currentSeat(passed)).toBe(2);
    expect(rejected(s, { type: 'pass', seat: 1 })).toBe(true);
  });

  test('unplayable drawn card ends turn', () => {
    const s = withTopOfPile(makeState([['b9a'], ['g1a']], 'r7a'), 'g3a');
    const n = ok(s, { type: 'draw', seat: 1 });
    expect(n.drawnCardId).toBeNull();
    expect(currentSeat(n)).toBe(2);
  });

  test('reshuffles discard when draw pile empties', () => {
    const base = makeState([['b9a'], ['g1a']], 'r7a');
    const s = { ...base, drawPile: [], discard: cards('g5a', 'g6a', 'r7a') };
    const n = ok(s, { type: 'draw', seat: 1 });
    expect(handOf(n, 1)).toHaveLength(2);
    expect(n.discard.map((c) => c.id)).toEqual(['r7a']);
    expect(n.drawPile).toHaveLength(1);
  });

  test('draws only what exists', () => {
    const base = makeState([['b9a'], ['g1a']], 'r7a', { pendingDraw: 4 });
    const s = { ...base, drawPile: cards('g5a'), discard: cards('g6a', 'r7a') };
    const n = ok(s, { type: 'draw', seat: 1 });
    expect(handOf(n, 1)).toHaveLength(3);
    expect(n.pendingDraw).toBe(0);
    expect(currentSeat(n)).toBe(2);
  });
});

describe('one card', () => {
  test('playing to one card sets oneCardPending; callOne clears it', () => {
    const s = makeState([['r1a', 'r2a'], ['g1a', 'g2a']], 'r7a');
    const n = ok(s, { type: 'play', seat: 1, cardId: 'r1a' });
    expect(n.oneCardPending).toBe(1);
    expect(rejected(n, { type: 'callOne', seat: 2 })).toBe(true);
    expect(ok(n, { type: 'callOne', seat: 1 }).oneCardPending).toBeNull();
  });

  test('catch gives target 2 cards; catch after next player acted is rejected', () => {
    const s = makeState([['r1a', 'r2a'], ['r3a', 'g2a'], ['b1a']], 'r7a');
    const n = ok(s, { type: 'play', seat: 1, cardId: 'r1a' });
    const caught = ok(n, { type: 'catch', seat: 3, target: 1 });
    expect(handOf(caught, 1)).toHaveLength(1 + CATCH_PENALTY);
    expect(caught.oneCardPending).toBeNull();
    expect(rejected(n, { type: 'catch', seat: 1, target: 1 })).toBe(true);
    const moved = ok(n, { type: 'play', seat: 2, cardId: 'r3a' });
    expect(rejected(moved, { type: 'catch', seat: 3, target: 1 })).toBe(true);
  });
});

describe('timeout', () => {
  test('timeout before 30s rejected; after 30s draws 1 and advances', () => {
    const s = withTopOfPile(makeState([['b9a'], ['g1a']], 'r7a', { turnStartedAt: 0 }), 'r5a');
    expect(rejected(s, { type: 'timeout' }, TURN_MS - 1)).toBe(true);
    const n = ok(s, { type: 'timeout' }, TURN_MS);
    expect(handOf(n, 1)).toHaveLength(2);
    expect(currentSeat(n)).toBe(2);
    expect(n.drawnCardId).toBeNull();
    expect(n.turnStartedAt).toBe(TURN_MS);
  });

  test('timeout with pendingDraw draws the stack', () => {
    const s = makeState([['b9a'], ['g1a']], 'rD1', { pendingDraw: 4 });
    const n = ok(s, { type: 'timeout' }, TURN_MS);
    expect(handOf(n, 1)).toHaveLength(5);
    expect(n.pendingDraw).toBe(0);
    expect(currentSeat(n)).toBe(2);
  });

  test('timeout after drawing a playable card passes', () => {
    const s = makeState([['b9a', 'r5a'], ['g1a']], 'r7a', { drawnCardId: 'r5a' });
    const n = ok(s, { type: 'timeout' }, TURN_MS);
    expect(handOf(n, 1)).toHaveLength(2);
    expect(currentSeat(n)).toBe(2);
  });
});

describe('win', () => {
  test('last card wins and finishes game; actions after finish rejected', () => {
    const s = makeState([['r1a'], ['g1a']], 'r7a');
    const n = ok(s, { type: 'play', seat: 1, cardId: 'r1a' });
    expect(n.phase).toBe('finished');
    expect(n.winner).toBe(1);
    expect(n.lastEvent).toEqual({ kind: 'win', seat: 1 });
    expect(rejected(n, { type: 'draw', seat: 2 })).toBe(true);
  });

  test('every accepted action bumps version and keeps input unchanged', () => {
    const s = makeState([['r1a', 'r2a'], ['g1a']], 'r7a');
    const before = JSON.stringify(s);
    const n = ok(s, { type: 'play', seat: 1, cardId: 'r1a' });
    expect(n.version).toBe(2);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('mostCommonColor', () => {
  test('mostCommonColor ignores wilds, ties broken by COLORS order', () => {
    expect(mostCommonColor(cards('g1a', 'g2a', 'b1a', 'W1', 'F1'))).toBe('green');
    expect(mostCommonColor(cards('b1a', 'y1a'))).toBe('yellow');
    expect(mostCommonColor(cards('W1'))).toBe('red');
  });
});
