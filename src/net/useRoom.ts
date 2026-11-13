import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAction, startGame } from '../game/rules';
import type { Action, GameState } from '../game/types';
import type { LobbyState, NetMessage } from './protocol';
import { CLIENT_ID, RealtimeChannel } from './realtime';
import { acceptSnapshot, claimSeat as claimSeatPure, electHost, HEARTBEAT_MS, HOST_TIMEOUT_MS, leaveSeat as leaveSeatPure, rebaseTurnStart, seatOf } from './room';

export const SESSION_KEY = 'colorpang_session';
export interface SavedSession {
  roomCode: string;
  name: string;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: SavedSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* 무시 */
  }
}

export interface RoomApi {
  roomCode: string;
  myId: string;
  mySeat: number | null;
  isHost: boolean;
  online: boolean;
  provider: string;
  lobby: LobbyState | null;
  game: GameState | null;
  peersOnline: Record<number, boolean>;
  claimSeat(seat: number, name: string): void;
  leaveSeat(): void;
  start(): void;
  rematch(): void;
  act(a: Action): void;
  leave(): void;
  error: string | null;
  clearError(): void;
}

const JOIN_TIMEOUT_MS = 5_000;
const rng = () => Math.random();

export function useRoom(roomCode: string, mode: 'create' | 'join'): RoomApi {
  const myId = CLIENT_ID;
  const [lobby, setLobbyState] = useState<LobbyState | null>(null);
  const [game, setGameState] = useState<GameState | null>(null);
  const [online, setOnline] = useState(false);
  const [provider, setProvider] = useState('연결 중...');
  const [error, setError] = useState<string | null>(null);
  const [peersOnline, setPeersOnline] = useState<Record<number, boolean>>({});

  const lobbyRef = useRef<LobbyState | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSeen = useRef<Record<string, { seat: number | null; at: number }>>({});
  const joinedAt = useRef(Date.now());
  const lastHello = useRef(0);

  const setLobby = (l: LobbyState | null) => {
    lobbyRef.current = l;
    setLobbyState(l);
  };
  const setGame = (g: GameState | null) => {
    gameRef.current = g;
    setGameState(g);
  };
  const send = (m: NetMessage) => channelRef.current?.publish(m);
  const amHost = () => lobbyRef.current?.hostId === myId;

  const broadcastLobby = () => {
    if (lobbyRef.current) send({ type: 'LOBBY', lobby: lobbyRef.current });
  };
  const broadcastGame = () => {
    if (gameRef.current) send({ type: 'SNAPSHOT', hostId: myId, state: gameRef.current, sentAt: Date.now() });
  };

  /** 심판: 행동 요청 처리 (자기 것 포함) */
  const hostHandleAction = (clientId: string, action: Action) => {
    const g = gameRef.current;
    const l = lobbyRef.current;
    if (!g || !l) return;
    const seat = seatOf(l, clientId);
    if (action.type === 'timeout' || seat === null || action.seat !== seat) {
      send({ type: 'REJECT', clientId, reason: '잘못된 요청이에요' });
      return;
    }
    const r = applyAction(g, action, rng, Date.now());
    if (r.ok) {
      setGame(r.state);
      broadcastGame();
    } else if (clientId === myId) setError(r.reason);
    else send({ type: 'REJECT', clientId, reason: r.reason });
  };

  const hostStart = (rematch: boolean) => {
    const l = lobbyRef.current;
    if (!l || l.hostId !== myId) return;
    const now = Date.now();
    const seats = Object.entries(l.seats)
      .map(([seat, s]) => ({ seat: Number(seat), name: s.name, clientId: s.clientId }))
      // 시작할 때 연결이 끊겨 있는 자리는 빼고 시작 (방장 본인은 항상 포함)
      .filter((p) => p.clientId === myId || (lastSeen.current[p.clientId] && now - lastSeen.current[p.clientId].at <= HOST_TIMEOUT_MS));
    if (seats.length < 2) {
      setError('2명 이상 있어야 시작할 수 있어요');
      return;
    }
    const prevVersion = gameRef.current?.version ?? 0;
    const g = startGame(seats, rng, now);
    g.version = prevVersion + 1;
    const keptSeats: LobbyState['seats'] = {};
    seats.forEach((p) => (keptSeats[p.seat] = { name: p.name, clientId: p.clientId }));
    setLobby({ ...l, seats: rematch ? l.seats : keptSeats, started: true, version: l.version + 1 });
    setGame(g);
    broadcastLobby();
    broadcastGame();
  };

  const onMessage = (m: NetMessage) => {
    const now = Date.now();
    switch (m.type) {
      case 'HEARTBEAT': {
        lastSeen.current[m.clientId] = { seat: m.seat, at: now };
        // 심판보다 판이 뒤처져 있으면 다시 요청
        if (m.isHost && !amHost() && m.version > (gameRef.current?.version ?? 0)) send({ type: 'HELLO', clientId: myId });
        return;
      }
      case 'LOBBY': {
        const cur = lobbyRef.current;
        if (cur && m.lobby.version <= cur.version) return;
        lastSeen.current[m.lobby.hostId] = { seat: seatOf(m.lobby, m.lobby.hostId), at: now };
        setLobby(m.lobby);
        setError((e) => (e === '방을 찾을 수 없어요. 코드를 확인해 주세요' ? null : e));
        return;
      }
      case 'SNAPSHOT': {
        if (!acceptSnapshot(gameRef.current, m.state)) return;
        const prev = lastSeen.current[m.hostId];
        lastSeen.current[m.hostId] = { seat: prev?.seat ?? null, at: now };
        setGame(rebaseTurnStart(m.state, m.sentAt, now));
        return;
      }
      case 'REJECT': {
        if (m.clientId === myId) setError(m.reason);
        return;
      }
    }
    if (!amHost()) return;
    // ---- 아래는 심판만 처리 ----
    switch (m.type) {
      case 'HELLO':
        broadcastLobby();
        broadcastGame();
        return;
      case 'CLAIM_SEAT': {
        const l = lobbyRef.current!;
        const r = claimSeatPure(l, m.clientId, m.seat, m.name);
        if (r.ok) {
          if (r.lobby !== l) setLobby(r.lobby);
          broadcastLobby();
          if (l.started) broadcastGame();
        } else send({ type: 'REJECT', clientId: m.clientId, reason: r.reason });
        return;
      }
      case 'LEAVE_SEAT': {
        const next = leaveSeatPure(lobbyRef.current!, m.clientId);
        if (next !== lobbyRef.current) {
          setLobby(next);
          broadcastLobby();
        }
        return;
      }
      case 'ACTION':
        hostHandleAction(m.clientId, m.action);
        return;
    }
  };
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // 채널 연결
  useEffect(() => {
    joinedAt.current = Date.now();
    lastSeen.current = {};
    setGame(null);
    if (mode === 'create') setLobby({ version: 1, hostId: myId, seats: {}, started: false });
    else setLobby(null);

    const ch = new RealtimeChannel(roomCode, myId);
    channelRef.current = ch;
    const offMsg = ch.subscribe((m) => onMessageRef.current(m));
    const offStatus = ch.onStatus((on, p) => {
      setOnline(on);
      setProvider(p);
    });
    if (mode === 'join') ch.publish({ type: 'HELLO', clientId: myId });
    return () => {
      offMsg();
      offStatus();
      ch.destroy();
      channelRef.current = null;
    };
  }, [roomCode, mode, myId]);

  // 생존 신호, 심판 선출, 입장 재시도, 시간 초과 검사
  useEffect(() => {
    const beat = () => {
      const l = lobbyRef.current;
      send({
        type: 'HEARTBEAT',
        clientId: myId,
        seat: l ? seatOf(l, myId) : null,
        isHost: amHost(),
        version: gameRef.current?.version ?? 0,
        sentAt: Date.now(),
      });
    };
    beat();
    const hb = setInterval(beat, HEARTBEAT_MS);

    const tick = setInterval(() => {
      const now = Date.now();
      const l = lobbyRef.current;
      if (!l) {
        if (now - lastHello.current >= 1500) {
          lastHello.current = now;
          send({ type: 'HELLO', clientId: myId });
        }
        if (now - joinedAt.current > JOIN_TIMEOUT_MS) setError('방을 찾을 수 없어요. 코드를 확인해 주세요');
        return;
      }
      lastSeen.current[myId] = { seat: seatOf(l, myId), at: now };

      // 접속 상태 표시
      const status: Record<number, boolean> = {};
      for (const [seat, s] of Object.entries(l.seats)) {
        const seen = lastSeen.current[s.clientId];
        status[Number(seat)] = !!seen && now - seen.at <= HOST_TIMEOUT_MS;
      }
      setPeersOnline((prev) => (JSON.stringify(prev) === JSON.stringify(status) ? prev : status));

      // 심판 이어받기 (들어온 지 6초가 지난 뒤부터)
      if (now - joinedAt.current > HOST_TIMEOUT_MS && l.hostId !== myId) {
        if (electHost(lastSeen.current, l.hostId, now) === myId) {
          setLobby({ ...l, hostId: myId, version: l.version + 1 });
          if (gameRef.current) setGame({ ...gameRef.current, version: gameRef.current.version + 1 });
          broadcastLobby();
          broadcastGame();
        }
      }

      // 심판: 시간 초과 처리
      if (l.hostId === myId && gameRef.current?.phase === 'playing') {
        const r = applyAction(gameRef.current, { type: 'timeout' }, rng, now);
        if (r.ok) {
          setGame(r.state);
          broadcastGame();
        }
      }
    }, 500);
    return () => {
      clearInterval(hb);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, mode, myId]);

  const mySeat = lobby ? seatOf(lobby, myId) : null;

  // 재입장용 세션 저장
  useEffect(() => {
    if (lobby && mySeat !== null) saveSession({ roomCode, name: lobby.seats[mySeat].name });
  }, [lobby, mySeat, roomCode]);

  const claimSeat = useCallback((seat: number, name: string) => {
    if (amHost()) onMessageRef.current({ type: 'CLAIM_SEAT', clientId: myId, seat, name });
    else send({ type: 'CLAIM_SEAT', clientId: myId, seat, name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const leaveSeat = useCallback(() => {
    if (amHost()) onMessageRef.current({ type: 'LEAVE_SEAT', clientId: myId });
    else send({ type: 'LEAVE_SEAT', clientId: myId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const act = useCallback((a: Action) => {
    if (amHost()) hostHandleAction(myId, a);
    else send({ type: 'ACTION', clientId: myId, action: a });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const start = useCallback(() => hostStart(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  const rematch = useCallback(() => {
    if (gameRef.current?.phase === 'finished') hostStart(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback(() => {
    leaveSeat();
    saveSession(null);
  }, [leaveSeat]);

  return {
    roomCode,
    myId,
    mySeat,
    isHost: lobby?.hostId === myId,
    online,
    provider,
    lobby,
    game,
    peersOnline,
    claimSeat,
    leaveSeat,
    start,
    rematch,
    act,
    leave,
    error,
    clearError: () => setError(null),
  };
}
