import { describe, expect, test } from 'vitest';
import { CORNERS, pickCorner } from './oneCall';

describe('pickCorner', () => {
  test('returns one of the four corners', () => {
    expect(CORNERS).toEqual(['tl', 'tr', 'bl', 'br']);
    for (let i = 0; i < 50; i++) expect(CORNERS).toContain(pickCorner());
  });

  test('maps rng evenly onto the four corners', () => {
    expect(pickCorner(() => 0)).toBe('tl');
    expect(pickCorner(() => 0.3)).toBe('tr');
    expect(pickCorner(() => 0.6)).toBe('bl');
    expect(pickCorner(() => 0.999)).toBe('br');
  });
});
