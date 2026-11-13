import { useState } from 'react';
import { MAX_PLAYERS } from '../net/room';
import type { RoomApi } from '../net/useRoom';
import { ConnectionBadge } from './ConnectionBadge';

const NAME_KEY = 'colorpang_name';
function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LobbyScreen({ room, onExit }: { room: RoomApi; onExit: () => void }) {
  const [name, setName] = useState(loadName);
  const lobby = room.lobby!;
  const seated = Object.values(lobby.seats).length;
  const onlineSeated = Object.entries(lobby.seats).filter(([s]) => room.peersOnline[Number(s)] || lobby.seats[Number(s)].clientId === room.myId).length;

  const pick = (seat: number) => {
    const n = name.trim() || `친구${seat}`;
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* 무시 */
    }
    room.claimSeat(seat, n);
  };

  return (
    <div className="lobby">
      <div className="topbar">
        <button className="btn btn--ghost" onClick={onExit}>
          ← 나가기
        </button>
        <ConnectionBadge online={room.online} provider={room.provider} />
      </div>
      <div className="lobby__code">
        <span>방 코드</span>
        <strong>{room.roomCode}</strong>
        <small>친구들에게 이 번호를 알려 주세요</small>
      </div>

      <label className="lobby__name">
        내 이름
        <input
          className="input"
          value={name}
          maxLength={8}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름(별명)을 쓰고 자리를 골라요"
        />
      </label>

      <div className="seats">
        {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map((seat) => {
          const s = lobby.seats[seat];
          const mine = s?.clientId === room.myId;
          const offline = s && !mine && !room.peersOnline[seat];
          return (
            <button
              key={seat}
              className={`seat${mine ? ' seat--mine' : ''}${s && !mine ? ' seat--taken' : ''}${offline ? ' seat--offline' : ''}`}
              disabled={!!s && !mine}
              onClick={() => (mine ? room.leaveSeat() : pick(seat))}
            >
              <span className="seat__num">{seat}번 자리</span>
              <span className="seat__name">{s ? (mine ? `⭐ ${s.name}` : `👤 ${s.name}`) : '비어 있음'}</span>
              {mine && <span className="seat__hint">한 번 더 누르면 일어나요</span>}
              {offline && <span className="seat__hint">연결 끊김</span>}
              {s?.clientId === lobby.hostId && <span className="seat__crown">👑 방장</span>}
            </button>
          );
        })}
      </div>

      <p className="lobby__status">
        참여 현황: <b>{seated}</b> / {MAX_PLAYERS}명
      </p>

      {room.isHost ? (
        <button className="btn btn--big btn--primary" disabled={onlineSeated < 2 || room.mySeat === null} onClick={room.start}>
          {room.mySeat === null ? '먼저 내 자리를 골라요' : onlineSeated < 2 ? '친구를 기다리는 중... (2명부터 시작)' : `🚀 게임 시작 (${onlineSeated}명)`}
        </button>
      ) : (
        <p className="lobby__wait">👑 방장이 게임을 시작하면 모두 함께 시작해요</p>
      )}
      {room.error && (
        <div className="error-toast" onAnimationEnd={room.clearError}>
          {room.error}
        </div>
      )}
    </div>
  );
}
