import { describe, expect, test } from 'vitest';
import { createDeck, makeRng, shuffle } from './deck';
import { COLORS } from './types';

describe('deck', () => {
  test('createDeck has 108 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
  });

  test('composition', () => {
    const deck = createDeck();
    const numbers = deck.filter((c) => c.kind === 'number');
    expect(numbers).toHaveLength(76);
    for (const color of COLORS) {
      const mine = numbers.filter((c) => c.color === color);
      expect(mine).toHaveLength(19);
      expect(mine.filter((c) => c.value === 0)).toHaveLength(1);
      for (let v = 1; v <= 9; v++) expect(mine.filter((c) => c.value === v)).toHaveLength(2);
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      expect(deck.filter((c) => c.kind === kind)).toHaveLength(8);
    }
    const wilds = deck.filter((c) => c.kind === 'wild');
    const wild4s = deck.filter((c) => c.kind === 'wild4');
    expect(wilds).toHaveLength(4);
    expect(wild4s).toHaveLength(4);
    expect([...wilds, ...wild4s].every((c) => c.color === null)).toBe(true);
  });

  test('shuffle is deterministic per seed and keeps cards', () => {
    const deck = createDeck();
    const before = deck.map((c) => c.id);
    const a = shuffle(deck, makeRng(42)).map((c) => c.id);
    const b = shuffle(deck, makeRng(42)).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(before);
    expect([...a].sort()).toEqual([...before].sort());
    expect(deck.map((c) => c.id)).toEqual(before);
  });
});
