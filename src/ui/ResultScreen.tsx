import type { GameState } from '../game/types';
import type { RoomApi } from '../net/useRoom';

export function ResultScreen({ room, game, onExit }: { room: RoomApi; game: GameState; onExit: () => void }) {
  const winner = game.players.find((p) => p.seat === game.winner);
  const ranking = [...game.players].sort((a, b) => a.hand.length - b.hand.length);
  const iWon = winner?.clientId === room.myId;
  return (
    <div className="modal result">
      <div className="modal__box result__box">
        <div className="result__trophy">{iWon ? '🎉' : '🏆'}</div>
        <h2>{iWon ? '내가 이겼어요!' : `${winner?.name ?? ''} 승리!`}</h2>
        <ol className="result__list">
          {ranking.map((p) => (
            <li key={p.seat} className={p.seat === game.winner ? 'result__win' : ''}>
              <span>{p.name}</span>
              <span>{p.hand.length === 0 ? '다 냈어요!' : `${p.hand.length}장 남음`}</span>
            </li>
          ))}
        </ol>
        <div className="modal__actions">
          <button className="btn" onClick={onExit}>
            나가기
          </button>
          {room.isHost ? (
            <button className="btn btn--primary" onClick={room.rematch}>
              🔁 한 판 더
            </button>
          ) : (
            <span className="muted">방장이 [한 판 더]를 누르면 다시 시작해요</span>
          )}
        </div>
      </div>
    </div>
  );
}
