import { useState } from 'react';
import { makeRng } from './game/deck';
import { newRoomCode } from './net/room';
import { loadSession, saveSession, useRoom } from './net/useRoom';
import { CardGallery } from './ui/CardGallery';
import { GameScreen } from './ui/GameScreen';
import { HomeScreen } from './ui/HomeScreen';
import { LobbyScreen } from './ui/LobbyScreen';
import { ResultScreen } from './ui/ResultScreen';

type View = { kind: 'home' } | { kind: 'room'; code: string; mode: 'create' | 'join' };

function Room({ code, mode, onExit }: { code: string; mode: 'create' | 'join'; onExit: () => void }) {
  const room = useRoom(code, mode);
  const exit = () => {
    room.leave();
    onExit();
  };

  if (!room.lobby) {
    return (
      <div className="center-msg">
        {room.error ? (
          <>
            <p>😢 {room.error}</p>
            <button className="btn" onClick={exit}>
              처음으로
            </button>
          </>
        ) : (
          <p>방 {code}에 들어가는 중...</p>
        )}
      </div>
    );
  }

  const inGame = room.game && room.lobby.started && room.game.players.some((p) => p.clientId === room.myId);
  if (room.lobby.started && !inGame) {
    return (
      <div className="center-msg">
        <p>😢 이미 게임이 시작된 방이에요.</p>
        <button className="btn" onClick={exit}>
          처음으로
        </button>
      </div>
    );
  }
  if (room.game && inGame) {
    return (
      <>
        <GameScreen room={room} game={room.game} onExit={exit} />
        {room.game.phase === 'finished' && <ResultScreen room={room} game={room.game} onExit={exit} />}
      </>
    );
  }
  return <LobbyScreen room={room} onExit={exit} />;
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [session, setSession] = useState(loadSession);
  const params = new URLSearchParams(window.location.search);
  if (params.has('gallery')) return <CardGallery />;

  if (view.kind === 'room') {
    return (
      <Room
        key={view.code + view.mode}
        code={view.code}
        mode={view.mode}
        onExit={() => {
          setSession(loadSession());
          setView({ kind: 'home' });
        }}
      />
    );
  }
  return (
    <HomeScreen
      session={session}
      onCreate={() => {
        saveSession(null);
        setView({ kind: 'room', code: newRoomCode(makeRng(Date.now() ^ (Math.random() * 1e9))), mode: 'create' });
      }}
      onJoin={(code) => setView({ kind: 'room', code, mode: 'join' })}
    />
  );
}
