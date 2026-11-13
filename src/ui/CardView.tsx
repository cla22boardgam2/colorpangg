import type { Card, Color } from '../game/types';

export const COLOR_HEX: Record<Color, string> = {
  red: '#e8453c',
  yellow: '#f5b82e',
  green: '#2fb36d',
  blue: '#3a7be0',
};
const COLOR_DEEP: Record<Color, string> = {
  red: '#b52a22',
  yellow: '#c98a0c',
  green: '#1d8550',
  blue: '#2457ad',
};
export const COLOR_NAME: Record<Color, string> = { red: '빨강', yellow: '노랑', green: '초록', blue: '파랑' };
const INK = '#1b1440';

export type CardSize = 'sm' | 'md' | 'lg';
export const CARD_WIDTH: Record<CardSize, number> = { sm: 52, md: 76, lg: 104 };

/** 색약 학생을 위한 색별 모양 기호: 빨강 ● / 노랑 ★ / 초록 ▲ / 파랑 ◆ */
export function ColorShape({ color, cx, cy, r, fill }: { color: Color; cx: number; cy: number; r: number; fill: string }) {
  if (color === 'red') return <circle cx={cx} cy={cy} r={r} fill={fill} />;
  if (color === 'green') {
    const pts = [
      [cx, cy - r],
      [cx + r * 0.95, cy + r * 0.75],
      [cx - r * 0.95, cy + r * 0.75],
    ];
    return <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={fill} />;
  }
  if (color === 'blue') {
    const pts = [
      [cx, cy - r],
      [cx + r * 0.8, cy],
      [cx, cy + r],
      [cx - r * 0.8, cy],
    ];
    return <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={fill} />;
  }
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`);
  }
  return <polygon points={pts.join(' ')} fill={fill} />;
}

/** 배경 색종이 무늬 위치 (고정) */
const CONFETTI = [
  [16, 52, 4],
  [84, 40, 5],
  [22, 118, 5],
  [80, 104, 4],
  [50, 22, 3],
  [52, 132, 3],
];

function cornerLabel(card: Card): string {
  switch (card.kind) {
    case 'number':
      return String(card.value);
    case 'skip':
      return '쉬어';
    case 'reverse':
      return '⇄';
    case 'draw2':
      return '+2';
    case 'wild':
      return '★';
    case 'wild4':
      return '+4';
  }
}

function Pinwheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const order: Color[] = ['red', 'yellow', 'green', 'blue'];
  return (
    <g>
      {order.map((c, i) => {
        const a0 = (i * Math.PI) / 2 - Math.PI / 2;
        const a1 = a0 + Math.PI / 2;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        // 바람개비: 꽃잎 끝을 살짝 휘게
        const mx = cx + r * 1.15 * Math.cos(a0 + Math.PI / 4.5);
        const my = cy + r * 1.15 * Math.sin(a0 + Math.PI / 4.5);
        return (
          <path
            key={c}
            d={`M${cx},${cy} L${x0},${y0} Q${mx},${my} ${x1},${y1} Z`}
            fill={COLOR_HEX[c]}
            stroke={INK}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.22} fill="#fff" stroke={INK} strokeWidth={1.5} />
    </g>
  );
}

function CenterArt({ card, ink }: { card: Card; ink: string }) {
  const textProps = {
    fontFamily: "'Jua', 'Noto Sans KR', sans-serif",
    textAnchor: 'middle' as const,
    fill: ink,
    stroke: INK,
    strokeWidth: 2,
    paintOrder: 'stroke' as const,
  };
  switch (card.kind) {
    case 'number':
      return (
        <g>
          <text x={50} y={94} fontSize={58} {...textProps}>
            {card.value}
          </text>
          {(card.value === 6 || card.value === 9) && (
            <rect x={38} y={101} width={24} height={4} rx={2} fill={INK} />
          )}
        </g>
      );
    case 'skip':
      // 팔각형 '쉬어' 표지판
      return (
        <g>
          <polygon
            points="38,52 62,52 78,68 78,92 62,108 38,108 22,92 22,68"
            fill={ink}
            stroke={INK}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <text x={50} y={89} fontSize={22} fontFamily="'Jua', sans-serif" textAnchor="middle" fill="#fff">
            쉬어
          </text>
        </g>
      );
    case 'reverse':
      return (
        <g fill="none" stroke={ink} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
          <g stroke={INK} strokeWidth={10}>
            <path d="M30,72 A22,22 0 0 1 70,64" />
            <path d="M70,88 A22,22 0 0 1 30,96" />
          </g>
          <path d="M30,72 A22,22 0 0 1 70,64" />
          <path d="M70,88 A22,22 0 0 1 30,96" />
          <polygon points="64,52 80,66 62,74" fill={ink} stroke={INK} strokeWidth={2} />
          <polygon points="36,108 20,94 38,86" fill={ink} stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'draw2':
      return (
        <g>
          <rect x={28} y={42} width={26} height={36} rx={5} fill="#fff" stroke={INK} strokeWidth={2} transform="rotate(-12 41 60)" />
          <rect x={46} y={46} width={26} height={36} rx={5} fill={ink} stroke={INK} strokeWidth={2} transform="rotate(10 59 64)" />
          <text x={50} y={112} fontSize={26} {...textProps}>
            +2
          </text>
        </g>
      );
    case 'wild':
      return <Pinwheel cx={50} cy={80} r={28} />;
    case 'wild4':
      return (
        <g>
          <Pinwheel cx={50} cy={64} r={20} />
          <text x={50} y={112} fontSize={26} {...textProps} fill="#fff">
            +4
          </text>
        </g>
      );
  }
}

export function CardView({
  card,
  size = 'md',
  playable,
  dimmed,
  onClick,
}: {
  card: Card;
  size?: CardSize;
  playable?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const wild = card.color === null;
  const body = wild ? '#2a2550' : COLOR_HEX[card.color!];
  const deep = wild ? '#17132e' : COLOR_DEEP[card.color!];
  const ink = wild ? '#fff' : COLOR_HEX[card.color!];
  const label = cornerLabel(card);
  const w = CARD_WIDTH[size];
  return (
    <svg
      className={`card${playable ? ' card--playable' : ''}${dimmed ? ' card--dimmed' : ''}${onClick ? ' card--clickable' : ''}`}
      width={w}
      height={w * 1.5}
      viewBox="0 0 100 150"
      onClick={onClick}
      role={onClick ? 'button' : 'img'}
      aria-label={describeCard(card)}
    >
      <rect x={1} y={1} width={98} height={148} rx={12} fill={deep} />
      <rect x={4} y={4} width={92} height={142} rx={10} fill={body} />
      {wild
        ? (['red', 'yellow', 'green', 'blue'] as Color[]).map((c, i) => (
            <rect key={c} x={4 + i * 23} y={4} width={23} height={8} fill={COLOR_HEX[c]} opacity={0.9} />
          ))
        : CONFETTI.map(([x, y, r], i) => <ColorShape key={i} color={card.color!} cx={x} cy={y} r={r} fill="rgba(255,255,255,0.28)" />)}
      <rect x={16} y={30} width={68} height={90} rx={16} fill={wild ? '#3b3570' : '#fff'} stroke={INK} strokeWidth={2} />
      <CenterArt card={card} ink={ink} />
      {/* 왼쪽 위 모서리 */}
      <text x={12} y={24} fontSize={label.length > 1 ? 13 : 17} fontFamily="'Jua', sans-serif" fill="#fff" stroke={INK} strokeWidth={2.5} paintOrder="stroke">
        {label}
      </text>
      {!wild && <ColorShape color={card.color!} cx={88} cy={18} r={7} fill="#fff" />}
      {/* 오른쪽 아래 모서리 (뒤집힘) */}
      <g transform="rotate(180 50 75)">
        <text x={12} y={24} fontSize={label.length > 1 ? 13 : 17} fontFamily="'Jua', sans-serif" fill="#fff" stroke={INK} strokeWidth={2.5} paintOrder="stroke">
          {label}
        </text>
        {!wild && <ColorShape color={card.color!} cx={88} cy={18} r={7} fill="#fff" />}
      </g>
    </svg>
  );
}

export function describeCard(card: Card): string {
  const color = card.color ? COLOR_NAME[card.color] + ' ' : '';
  switch (card.kind) {
    case 'number':
      return `${color}${card.value}`;
    case 'skip':
      return `${color}쉬어`;
    case 'reverse':
      return `${color}방향 바꾸기`;
    case 'draw2':
      return `${color}+2`;
    case 'wild':
      return '무지개';
    case 'wild4':
      return '무지개 +4';
  }
}
