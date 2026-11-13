import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAction, startGame } from '../game/rules';
import type { Action, GameState } from '../game/types';
import type { LobbyState, NetMessage } from './protocol';
import { CLIENT_ID, RealtimeChannel } from './realtime';
import {
  canElect,
  claimSeat as claimSeatPure,
  electHost,
  HEARTBEAT_MS,
  HOST_TIMEOUT_MS,
  leaveSeat as leaveSeatPure,
  lobbyIsNewer,
  rebaseTurnStart,
  seatOf,
  snapshotIsNewer,
  type Seen,
} from './room';

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

const JOIN_TIMEOUT_MS = 6_000;
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
  const lastSeen = useRef<Record<string, Seen>>({});
  /** 내가 가진 판의 (기수, 버전) */
  const snapMeta = useRef<{ term: number; version: number } | null>(null);
  /** 연결·화면이 안정된 시각. 이 뒤로 6초가 지나야 심판 이어받기 가능 */
  const stableSince = useRef(Date.now());
  const onlineRef = useRef(false);
  const lastTick = useRef(Date.now());
  const joinedAt = useRef(Date.now());
  const lastHello = useRef(0);

  const setLobby = (l: LobbyState | null) => {
    lobbyRef.current = l;
    setLobbyState(l);
  };
  const setGame = (g: GameState | null, term?: number) => {
    gameRef.current = g;
    snapMeta.current = g ? { term: term ?? lobbyRef.current?.term ?? 1, version: g.version } : null;
    setGameState(g);
  };
  const send = (m: NetMessage) => channelRef.current?.publish(m);
  const amHost = () => lobbyRef.current?.hostId === myId;

  const broadcastLobby = () => {
    if (lobbyRef.current) send({ type: 'LOBBY', lobby: lobbyRef.current });
  };
  const broadcastGame = () => {
    if (gameRef.current) send({ type: 'SNAPSHOT', hostId: myId, term: lobbyRef.current?.term ?? 1, state: gameRef.current, sentAt: Date.now() });
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
        lastSeen.current[m.clientId] = { seat: m.seat, at: now, isHost: m.isHost };
        // 심판보다 판이 뒤처져 있으면 다시 요청
        if (
          m.isHost &&
          !amHost() &&
          m.clientId === lobbyRef.current?.hostId &&
          m.version > 0 &&
          snapshotIsNewer(snapMeta.current, { term: m.term, version: m.version })
        )
          send({ type: 'HELLO', clientId: myId });
        return;
      }
      case 'LOBBY': {
        const cur = lobbyRef.current;
        if (!lobbyIsNewer(cur, m.lobby)) return;
        const wasHost = cur?.hostId === myId;
        lastSeen.current[m.lobby.hostId] = { seat: seatOf(m.lobby, m.lobby.hostId), at: now, isHost: true };
        setLobby(m.lobby);
        // 다른 심판에게 자리를 넘겼으면 최신 판을 받아 옴
        if (wasHost && m.lobby.hostId !== myId) send({ type: 'HELLO', clientId: myId });
        setError((e) => (e === '방을 찾을 수 없어요. 코드를 확인해 주세요' ? null : e));
        return;
      }
      case 'SNAPSHOT': {
        // 지금 심판이 보낸 것만, (기수, 버전)이 더 새로울 때만 받음
        if (m.hostId === myId || m.hostId !== lobbyRef.current?.hostId) return;
        if (!snapshotIsNewer(snapMeta.current, { term: m.term, version: m.state.version })) return;
        const prev = lastSeen.current[m.hostId];
        lastSeen.current[m.hostId] = { seat: prev?.seat ?? null, at: now, isHost: true };
        setGame(rebaseTurnStart(m.state, m.sentAt, now), m.term);
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
    if (mode === 'create') setLobby({ version: 1, term: 1, hostId: myId, seats: {}, started: false });
    else setLobby(null);

    const ch = new RealtimeChannel(roomCode, myId);
    channelRef.current = ch;
    const offMsg = ch.subscribe((m) => onMessageRef.current(m));
    const offStatus = ch.onStatus((on, p) => {
      if (on !== onlineRef.current) stableSince.current = Date.now();
      onlineRef.current = on;
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
        term: l?.term ?? 0,
        version: gameRef.current?.version ?? 0,
        sentAt: Date.now(),
      });
      // 심판은 로비를 계속 알려서, 심판이 둘이 되면 규칙대로 한쪽이 물러나게 함
      if (amHost()) broadcastLobby();
    };
    beat();
    const hb = setInterval(beat, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') stableSince.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVisible);

    const tick = setInterval(() => {
      const now = Date.now();
      // 잠자기 등으로 타이머가 한동안 멈췄다면 깨어난 것으로 보고 다시 기다림
      if (now - lastTick.current > 2000) stableSince.current = now;
      lastTick.current = now;
      const l = lobbyRef.current;
      if (!l) {
        if (now - lastHello.current >= 1500) {
          lastHello.current = now;
          send({ type: 'HELLO', clientId: myId });
        }
        // 공용 중계소 연결에 몇 초 걸릴 수 있으므로, 연결된 뒤부터 기다린 시간으로 판단
        if (onlineRef.current && now - Math.max(stableSince.current, joinedAt.current) > JOIN_TIMEOUT_MS)
          setError('방을 찾을 수 없어요. 코드를 확인해 주세요');
        return;
      }
      lastSeen.current[myId] = { seat: seatOf(l, myId), at: now, isHost: l.hostId === myId };

      // 접속 상태 표시
      const status: Record<number, boolean> = {};
      for (const [seat, s] of Object.entries(l.seats)) {
        const seen = lastSeen.current[s.clientId];
        status[Number(seat)] = !!seen && now - seen.at <= HOST_TIMEOUT_MS;
      }
      setPeersOnline((prev) => (JSON.stringify(prev) === JSON.stringify(status) ? prev : status));

      // 심판 이어받기 (들어온 지 6초가 지난 뒤부터)
      const stable = Math.max(stableSince.current, joinedAt.current);
      if (onlineRef.current && canElect(now, stable) && l.hostId !== myId) {
        if (electHost(lastSeen.current, l.hostId, now) === myId) {
          setLobby({ ...l, hostId: myId, term: l.term + 1, version: l.version + 1 });
          if (gameRef.current) setGame(gameRef.current, l.term + 1);
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
      document.removeEventListener('visibilitychange', onVisible);
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
