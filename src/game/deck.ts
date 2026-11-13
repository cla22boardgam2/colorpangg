import { COLORS, type Card, type Rng } from './types';

const COLOR_CODE = { red: 'r', yellow: 'y', green: 'g', blue: 'b' } as const;
const KIND_CODE = { skip: 'S', reverse: 'R', draw2: 'D' } as const;

/** mulberry32 — 시드 고정 난수 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    const c = COLOR_CODE[color];
    deck.push({ id: `${c}0`, kind: 'number', color, value: 0 });
    for (let v = 1; v <= 9; v++) {
      for (const copy of ['a', 'b']) deck.push({ id: `${c}${v}${copy}`, kind: 'number', color, value: v });
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      for (const copy of [1, 2]) deck.push({ id: `${c}${KIND_CODE[kind]}${copy}`, kind, color, value: null });
    }
  }
  for (let i = 1; i <= 4; i++) {
    deck.push({ id: `W${i}`, kind: 'wild', color: null, value: null });
    deck.push({ id: `F${i}`, kind: 'wild4', color: null, value: null });
  }
  return deck;
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
