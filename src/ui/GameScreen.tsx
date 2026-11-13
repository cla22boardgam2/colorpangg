import { useEffect, useMemo, useRef, useState } from 'react';
import { canPlay, currentSeat, mostCommonColor } from '../game/rules';
import { COLORS, type Card, type Color, type GameEvent, type GameState } from '../game/types';
import type { RoomApi } from '../net/useRoom';
import { CardBack } from './CardBack';
import { CARD_WIDTH, COLOR_HEX, COLOR_NAME, CardView, ColorShape, describeCard } from './CardView';
import { ColorPicker } from './ColorPicker';
import { ConnectionBadge } from './ConnectionBadge';
import { TurnTimer, useRemaining } from './TurnTimer';

const KIND_ORDER = { number: 0, skip: 1, reverse: 2, draw2: 3, wild: 4, wild4: 5 } as const;
function sortHand(hand: Card[]): Card[] {
  const colorIdx = (c: Card) => (c.color ? COLORS.indexOf(c.color) : 9);
  return [...hand].sort(
    (a, b) => colorIdx(a) - colorIdx(b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.value ?? 0) - (b.value ?? 0),
  );
}

function eventText(ev: GameEvent | null, nameOf: (seat: number) => string): string | null {
  if (!ev) return null;
  switch (ev.kind) {
    case 'play':
      return `${nameOf(ev.seat)}: ${describeCard(ev.card)} 냈어요`;
    case 'draw':
      return ev.forced ? `${nameOf(ev.seat)}: 쌓인 카드 ${ev.count}장을 받았어요` : `${nameOf(ev.seat)}: 카드 1장을 뽑았어요`;
    case 'callOne':
      return `📣 ${nameOf(ev.seat)}: 한 장!`;
    case 'caught':
      return `🫵 ${nameOf(ev.by)}가 ${nameOf(ev.seat)}를 잡았어요! 벌칙 2장`;
    case 'timeout':
      return `⏰ ${nameOf(ev.seat)}: 시간 초과`;
    case 'win':
      return `🏆 ${nameOf(ev.seat)} 승리!`;
  }
}

/** 실제로 보이는 화면 크기 (태블릿 브라우저의 주소창·도구막대를 뺀 영역) */
function useViewport() {
  const read = () => ({
    w: window.visualViewport?.width ?? window.innerWidth,
    h: window.visualViewport?.height ?? window.innerHeight,
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener('resize', on);
    window.visualViewport?.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      window.visualViewport?.removeEventListener('resize', on);
    };
  }, []);
  return size;
}

export function GameScreen({ room, game, onExit }: { room: RoomApi; game: GameState; onExit: () => void }) {
  const [wildCard, setWildCard] = useState<Card | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const { w: width, h: height } = useViewport();
  const remaining = useRemaining(game.turnStartedAt);

  const meIdx = game.players.findIndex((p) => p.clientId === room.myId);
  const me = meIdx >= 0 ? game.players[meIdx] : null;
  const turnSeat = currentSeat(game);
  const myTurn = me !== null && turnSeat === me.seat && game.phase === 'playing';
  const top = game.discard[game.discard.length - 1];
  const nameOf = (seat: number) => game.players.find((p) => p.seat === seat)?.name ?? `${seat}번`;

  // 나를 기준으로 차례 순서대로 다른 사람들
  const others = useMemo(() => {
    const n = game.players.length;
    const start = meIdx >= 0 ? meIdx + 1 : 0;
    const list = [];
    for (let i = 0; i < n; i++) {
      const p = game.players[(start + i) % n];
      if (p.clientId !== room.myId) list.push(p);
    }
    return list;
  }, [game.players, meIdx, room.myId]);

  const hand = useMemo(() => (me ? sortHand(me.hand) : []), [me]);

  // 색 고르는 중 시간이 거의 다 되면 가장 많은 색으로 자동 선택
  const autoPicked = useRef(false);
  useEffect(() => {
    if (!wildCard) {
      autoPicked.current = false;
      return;
    }
    if (!myTurn) {
      setWildCard(null);
      return;
    }
    if (remaining <= 1000 && !autoPicked.current && me) {
      autoPicked.current = true;
      const rest = me.hand.filter((c) => c.id !== wildCard.id);
      room.act({ type: 'play', seat: me.seat, cardId: wildCard.id, chosenColor: mostCommonColor(rest) });
      setWildCard(null);
    }
  }, [remaining, wildCard, myTurn, me, room]);

  const playCard = (card: Card) => {
    if (!me || !myTurn || !canPlay(game, card)) return;
    if (card.kind === 'wild' || card.kind === 'wild4') setWildCard(card);
    else room.act({ type: 'play', seat: me.seat, cardId: card.id });
  };
  const pickColor = (color: Color) => {
    if (me && wildCard) room.act({ type: 'play', seat: me.seat, cardId: wildCard.id, chosenColor: color });
    setWildCard(null);
  };
  const draw = () => {
    if (me && myTurn && game.drawnCardId === null) room.act({ type: 'draw', seat: me.seat });
  };

  // 손패 겹치기: 화면 폭에 맞춰 간격 계산
  // 화면 높이에 맞춰 카드 크기 결정 (낮은 화면에서 손패가 잘리지 않게)
  const cardSize = height >= 860 && width >= 1000 ? 'lg' : height >= 560 ? 'md' : 'sm';
  const tableSize = height >= 760 ? 'lg' : height >= 520 ? 'md' : 'sm';
  const compact = height < 760;
  const cw = CARD_WIDTH[cardSize];
  const avail = Math.min(width, 1400) - (width < 820 ? 40 : 220);
  const step = hand.length > 1 ? Math.min(cw + 8, (avail - cw) / (hand.length - 1)) : cw;
  const overlap = step - cw;

  const toast = eventText(game.lastEvent, nameOf);
  const pendingOne = game.oneCardPending;

  return (
    <div className={`game${myTurn ? ' game--myturn' : ''}${compact ? ' game--compact' : ''}`}>
      <div className="topbar">
        <button className="btn btn--ghost btn--sm" onClick={() => setConfirmExit(true)}>
          ← 나가기
        </button>
        <span className="topbar__room">방 {room.roomCode}</span>
        <ConnectionBadge online={room.online} provider={room.provider} />
      </div>

      <div className="opponents">
        {others.map((p) => {
          const active = p.seat === turnSeat && game.phase === 'playing';
          const offline = !room.peersOnline[p.seat];
          return (
            <div key={p.seat} className={`opp${active ? ' opp--active' : ''}${offline ? ' opp--offline' : ''}`}>
              <div className="opp__name">
                {p.clientId === room.lobby?.hostId && '👑 '}
                {p.name}
              </div>
              <div className="opp__cards">
                {Array.from({ length: Math.min(p.hand.length, 8) }, (_, i) => (
                  <div key={i} className="opp__card" style={{ marginLeft: i === 0 ? 0 : -38 }}>
                    <CardBack size="sm" />
                  </div>
                ))}
              </div>
              <div className="opp__count">{p.hand.length}장</div>
              {pendingOne === p.seat && <div className="badge badge--warn">한 장 남음!</div>}
              {offline && <div className="badge">연결 끊김</div>}
              {active && <TurnTimer remaining={remaining} />}
            </div>
          );
        })}
      </div>

      <div className="table">
        <button
          className={`pile${myTurn && game.drawnCardId === null ? ' pile--active' : ''}`}
          onClick={draw}
          disabled={!myTurn || game.drawnCardId !== null}
          aria-label="카드 뽑기"
        >
          <CardBack size={tableSize} />
          <span className="pile__label">
            {myTurn && game.drawnCardId === null ? (game.pendingDraw > 0 ? `${game.pendingDraw}장 받기` : '1장 뽑기') : `${game.drawPile.length}장`}
          </span>
        </button>

        <div className="discard">
          <div key={top.id + game.discard.length} className="discard__top">
            <CardView card={top} size={tableSize} />
          </div>
        </div>

        <div className="table__info">
          <div className="color-now" style={{ background: COLOR_HEX[game.currentColor] }}>
            <svg width={26} height={26} viewBox="0 0 26 26">
              <ColorShape color={game.currentColor} cx={13} cy={13} r={10} fill="#fff" />
            </svg>
            지금 색: {COLOR_NAME[game.currentColor]}
          </div>
          <div className="direction">{game.direction === 1 ? '↻ 정방향' : '↺ 역방향'}</div>
          {game.pendingDraw > 0 && <div className="stack">🔥 +{game.pendingDraw} 쌓임</div>}
        </div>
      </div>

      <div className="turn-banner">
        {game.phase === 'playing' &&
          (myTurn ? (
            <>
              <strong>내 차례예요!</strong>
              {game.pendingDraw > 0 && <span> +2/+4로 넘기거나 {game.pendingDraw}장을 받아요</span>}
              <TurnTimer remaining={remaining} />
            </>
          ) : (
            <span>⏳ {nameOf(turnSeat)}의 차례</span>
          ))}
        {toast && (
          <div key={game.version} className="toast">
            {toast}
          </div>
        )}
      </div>

      {me ? (
        <div className="myarea">
          <div className="hand" style={{ paddingLeft: Math.max(0, -overlap / 2) }}>
            {hand.map((c, i) => {
              const playable = myTurn && canPlay(game, c);
              return (
                <div key={c.id} className="hand__card" style={{ marginLeft: i === 0 ? 0 : overlap, zIndex: i }}>
                  <CardView card={c} size={cardSize} playable={playable} dimmed={myTurn && !playable} onClick={playable ? () => playCard(c) : undefined} />
                </div>
              );
            })}
          </div>
          <div className="myarea__actions">
            <div className="myarea__me">
              {me.name} · {me.hand.length}장
            </div>
            {myTurn && game.drawnCardId !== null && (
              <button className="btn btn--primary" onClick={() => room.act({ type: 'pass', seat: me.seat })}>
                내지 않고 넘기기
              </button>
            )}
            {pendingOne === me.seat && (
              <button className="btn btn--one" onClick={() => room.act({ type: 'callOne', seat: me.seat })}>
                📣 한 장!
              </button>
            )}
            {pendingOne !== null && pendingOne !== me.seat && (
              <button className="btn btn--catch" onClick={() => room.act({ type: 'catch', seat: me.seat, target: pendingOne })}>
                🫵 잡았다! ({nameOf(pendingOne)})
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="myarea myarea--spectator">관전 중이에요</div>
      )}

      {room.error && <div className="error-toast" onAnimationEnd={room.clearError}>{room.error}</div>}
      {wildCard && <ColorPicker onPick={pickColor} onCancel={() => setWildCard(null)} />}
      {confirmExit && (
        <div className="modal" onClick={() => setConfirmExit(false)}>
          <div className="modal__box" onClick={(e) => e.stopPropagation()}>
            <h2>게임에서 나갈까요?</h2>
            <p className="muted">나가도 같은 방 코드로 다시 들어오면 내 카드 그대로 이어서 할 수 있어요.</p>
            <div className="modal__actions">
              <button className="btn" onClick={() => setConfirmExit(false)}>
                계속하기
              </button>
              <button className="btn btn--primary" onClick={onExit}>
                나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
