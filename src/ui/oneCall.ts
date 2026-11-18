/** [한 장!] 버튼이 나타날 화면 모서리: 왼쪽 위 / 오른쪽 위 / 왼쪽 아래 / 오른쪽 아래 */
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

export function pickCorner(rng: () => number = Math.random): Corner {
  return CORNERS[Math.min(CORNERS.length - 1, Math.floor(rng() * CORNERS.length))];
}
