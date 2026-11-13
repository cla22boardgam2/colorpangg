export type Color = 'red' | 'yellow' | 'green' | 'blue';
export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];
export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  id: string;
  kind: CardKind;
  color: Color | null;
  value: number | null;
}

export type Rng = () => number;
