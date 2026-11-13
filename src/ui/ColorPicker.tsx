import { COLORS, type Color } from '../game/types';
import { COLOR_HEX, COLOR_NAME, ColorShape } from './CardView';

export function ColorPicker({ onPick, onCancel }: { onPick: (c: Color) => void; onCancel: () => void }) {
  return (
    <div className="modal" onClick={onCancel}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <h2>다음 색을 골라요</h2>
        <div className="picker__grid">
          {COLORS.map((c) => (
            <button key={c} className="picker__btn" style={{ background: COLOR_HEX[c] }} onClick={() => onPick(c)}>
              <svg width={40} height={40} viewBox="0 0 40 40">
                <ColorShape color={c} cx={20} cy={20} r={16} fill="#fff" />
              </svg>
              {COLOR_NAME[c]}
            </button>
          ))}
        </div>
        <button className="btn btn--ghost" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
