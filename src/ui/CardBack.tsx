import { CARD_WIDTH, COLOR_HEX, type CardSize } from './CardView';
import type { Color } from '../game/types';

const STARS = [
  [18, 22, 3],
  [80, 30, 4],
  [26, 128, 4],
  [84, 120, 3],
  [14, 76, 2],
  [88, 78, 2],
];

function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`);
  }
  return pts.join(' ');
}

export function CardBack({ size = 'md' }: { size?: CardSize }) {
  const w = CARD_WIDTH[size];
  const dots: Color[] = ['red', 'yellow', 'green', 'blue'];
  return (
    <svg className="card card--back" width={w} height={w * 1.5} viewBox="0 0 100 150" role="img" aria-label="카드 뒷면">
      <rect x={1} y={1} width={98} height={148} rx={12} fill="#100c26" />
      <rect x={4} y={4} width={92} height={142} rx={10} fill="#2a2550" />
      <rect x={10} y={10} width={80} height={130} rx={8} fill="none" stroke="#5b52a8" strokeWidth={2} strokeDasharray="4 4" />
      {STARS.map(([x, y, r], i) => (
        <polygon key={i} points={star(x, y, r)} fill="#fff" opacity={0.5} />
      ))}
      {dots.map((c, i) => (
        <circle key={c} cx={32 + i * 12} cy={58} r={5} fill={COLOR_HEX[c]} />
      ))}
      <text
        x={50}
        y={92}
        fontSize={24}
        fontFamily="'Jua', sans-serif"
        textAnchor="middle"
        fill="#fff"
        stroke="#100c26"
        strokeWidth={3}
        paintOrder="stroke"
        transform="rotate(-8 50 85)"
      >
        컬러팡
      </text>
    </svg>
  );
}
