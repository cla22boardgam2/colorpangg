import { useState } from 'react';
import { CardView } from './CardView';
import { CardBack } from './CardBack';
import { RulesModal } from './RulesModal';
import { SettingsModal } from './SettingsModal';
import { relayUrl } from '../net/realtime';
import type { SavedSession } from '../net/useRoom';

const SHOWCASE = [
  { id: 'r7a', kind: 'number', color: 'red', value: 7 },
  { id: 'yD1', kind: 'draw2', color: 'yellow', value: null },
  { id: 'W1', kind: 'wild', color: null, value: null },
  { id: 'gR1', kind: 'reverse', color: 'green', value: null },
  { id: 'b3a', kind: 'number', color: 'blue', value: 3 },
] as const;

export function HomeScreen({
  session,
  onCreate,
  onJoin,
}: {
  session: SavedSession | null;
  onCreate: () => void;
  onJoin: (code: string) => void;
}) {
  const [keypad, setKeypad] = useState(false);
  const [code, setCode] = useState('');
  const [rules, setRules] = useState(false);
  const [settings, setSettings] = useState(false);
  const relay = relayUrl();

  const press = (d: string) => setCode((c) => (c.length < 6 ? c + d : c));

  return (
    <div className="home">
      <button className="icon-btn home__settings" onClick={() => setSettings(true)} aria-label="서버 설정">
        ⚙️
      </button>
      <div className="home__fan">
        {SHOWCASE.map((c, i) => (
          <div key={c.id} className="home__fan-card" style={{ transform: `rotate(${(i - 2) * 12}deg) translateY(${Math.abs(i - 2) * 8}px)` }}>
            <CardView card={c} size="lg" />
          </div>
        ))}
      </div>
      <h1 className="home__title">컬러팡</h1>
      <p className="home__sub">색깔이나 숫자를 맞춰서 손에 든 카드를 먼저 다 내면 이겨요!</p>

      {!keypad ? (
        <div className="home__actions">
          <button className="btn btn--big btn--primary" onClick={onCreate}>
            🎉 방 만들기
          </button>
          <button className="btn btn--big" onClick={() => setKeypad(true)}>
            🔑 방 코드로 입장
          </button>
          {session && (
            <button className="btn" onClick={() => onJoin(session.roomCode)}>
              ↩️ 이어서 하기 (방 {session.roomCode} · {session.name})
            </button>
          )}
          <button className="btn btn--ghost" onClick={() => setRules(true)}>
            📖 규칙 보기
          </button>
        </div>
      ) : (
        <div className="keypad">
          <div className="keypad__display">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="keypad__digit">
                {code[i] ?? ''}
              </span>
            ))}
          </div>
          <div className="keypad__grid">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button key={d} className="keypad__key" onClick={() => press(d)}>
                {d}
              </button>
            ))}
            <button className="keypad__key keypad__key--muted" onClick={() => setCode('')}>
              지우기
            </button>
            <button className="keypad__key" onClick={() => press('0')}>
              0
            </button>
            <button className="keypad__key keypad__key--muted" onClick={() => setCode((c) => c.slice(0, -1))}>
              ⌫
            </button>
          </div>
          <div className="keypad__row">
            <button className="btn" onClick={() => { setKeypad(false); setCode(''); }}>
              뒤로
            </button>
            <button className="btn btn--primary" disabled={code.length !== 6} onClick={() => onJoin(code)}>
              입장하기
            </button>
          </div>
        </div>
      )}
      <div className="home__footer">
        <CardBack size="sm" />
        <span>{relay ? `개인 서버 사용 중 (${relay})` : '공용 클라우드로 연결돼요'}</span>
      </div>
      {rules && <RulesModal onClose={() => setRules(false)} />}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}
