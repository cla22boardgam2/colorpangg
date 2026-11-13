# 컬러팡 (실시간 색깔 카드게임) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방 코드로 2~4명이 태블릿에서 실시간으로 함께 하는 색깔 카드게임을 HTML 1개로 만든다.

**Architecture:** 게임 규칙은 화면과 분리된 순수 함수(`applyAction`)로 만든다. 방장(심판) 기기가 이 함수로 판을 진행하고 판 전체 스냅샷을 방에 뿌린다. 다른 기기는 행동 요청만 보낸다. 통신은 13클루 `realtime.ts`를 이식해 공용 MQTT가 기본이고 개인 WebSocket 서버는 선택이다. 심판의 생존 신호가 6초 끊기면 남은 사람 중 자리 번호가 가장 빠른 사람이 심판을 이어받는다.

**Tech Stack:** Vite 6 + React 18 + TypeScript 5.6 + mqtt 5 + vite-plugin-singlefile, 테스트 Vitest, 개인 서버 Node + ws.

**Spec:** `docs/superpowers/specs/2026-11-13-card-game-design.md`

**프로젝트 루트:** `E:\00 초등학교\11 바이브코딩\우노` (아래 경로는 모두 이 기준). 참고 원본: `E:\00 초등학교\11 바이브코딩\13클루 보드게임` (이하 "13클루").

## Global Constraints

- '우노' 이름·로고·원작 카드 문양(기울어진 타원)을 화면·파일·문서 어디에도 쓰지 않는다. 게임 이름은 "컬러팡".
- 한 방 2~4명, 2명 이상이면 시작 가능. 방 코드는 6자리 랜덤 숫자.
- MQTT 토픽 `colorpang_v1/room_<방코드>`, 브로커 `wss://broker.emqx.io:8084/mqtt` → 실패 시 `wss://broker.hivemq.com:8884/mqtt`.
- localStorage 키 접두어 `colorpang_` (개인 서버 주소: `colorpang_relay_server`, 재입장 정보: `colorpang_session`).
- 카드 108장: 4색×(0 한 장, 1~9 두 장) + 4색×(skip·reverse·draw2 각 2장) + wild 4 + wild4 4.
- 시작 손패 7장. 차례 제한 30초. "한 장!" 벌칙 2장. 생존 신호 2초, 심판 이탈 판정 6초.
- +2/+4는 색과 무관하게 서로 자유롭게 쌓기. +4 위에 +2를 내면 현재 색 = 그 +2의 색. +4 도전 규칙 없음.
- 색 기호: red ● / yellow ★ / green ▲ / blue ◆. 카드 그림은 이미지 파일 없이 SVG/CSS.
- 태블릿 가로 화면 기준. 최종 산출물은 루트 `index.html` 1개.

## Review Focus

1. **카드 더미 소진** — 뽑을 더미가 비면 버린 더미(맨 위 제외)를 섞어 채운다. 둘 다 바닥나면 있는 만큼만 뽑고 게임은 계속. → Task 3 테스트 `reshuffles discard when draw pile empties`, `draws only what exists`.
2. **늦게/순서 뒤바뀌어 도착한 스냅샷** — 버전이 낮거나 같은 스냅샷은 무시, 심판이 바뀌어도 버전은 이어서 증가. → Task 5 테스트 `acceptSnapshot ignores stale versions`.
3. **심판 이어받기 시 타이머** — 기기 시계가 달라도 남은 시간이 이어진다. → Task 5 테스트 `rebaseTurnStart keeps remaining time`.
4. **같은 자리 동시 선택** — 두 아이가 같은 자리를 동시에 누르면 심판이 먼저 받은 사람만 앉고, 다른 쪽 화면에는 빈 자리로 돌아간다. → Task 5 테스트 `claimSeat rejects taken seat`.
5. **새로고침 후 재입장** — 같은 clientId로 같은 방에 들어오면 같은 자리·같은 손패. 게임 중 새 사람은 관전 불가 안내. → Task 5 테스트 `claimSeat restores same client`, `claimSeat rejects newcomer during game`.

---

## 파일 구조

```
package.json, vite.config.ts, tsconfig.json, index.source.html, .gitignore
scripts/buildSingle.cjs            13클루에서 복사 (빌드 → 루트 index.html)
server.cjs                         개인 서버 (13클루 것 이식)
실시간_서버_실행.bat, 방화벽_8080포트_허용.bat
배포_안내_가이드.md
src/
  main.tsx, App.tsx, index.css
  game/types.ts                    Card, GameState, Action 타입
  game/deck.ts                     createDeck, shuffle, makeRng
  game/rules.ts                    canPlay, startGame, applyAction, mostCommonColor
  game/rules.test.ts, game/deck.test.ts
  net/realtime.ts                  13클루 RealtimeChannel 이식 (메시지 타입만 교체)
  net/protocol.ts                  NetMessage 타입
  net/room.ts                      LobbyState·심판 선출·스냅샷 수용 순수 함수
  net/room.test.ts
  net/useRoom.ts                   위 것들을 묶는 React 훅 (심판 루프 포함)
  ui/CardView.tsx, ui/CardBack.tsx
  ui/HomeScreen.tsx, ui/LobbyScreen.tsx, ui/GameScreen.tsx, ui/ResultScreen.tsx
  ui/ColorPicker.tsx, ui/TurnTimer.tsx, ui/SettingsModal.tsx, ui/RulesModal.tsx
  ui/CardGallery.tsx               카드 시안 확인용 (?gallery 로 열림)
```

---

### Task 1: 프로젝트 뼈대

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.source.html`, `.gitignore`, `scripts/buildSingle.cjs`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/game/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm test`(vitest run), `npm run build`(루트 index.html 생성).

- [ ] **Step 1:** `git init` (폴더는 아직 git 저장소가 아님).
- [ ] **Step 2:** 13클루의 `vite.config.ts`, `tsconfig.json`, `scripts/buildSingle.cjs`를 복사. `index.source.html`은 13클루 것을 바탕으로 title "컬러팡", description "친구들과 실시간으로 즐기는 색깔 카드게임", 폰트는 Noto Sans KR + Jua(Google Fonts). `package.json`은 name `colorpang`, dependencies `mqtt ^5.16.1, react ^18.3.1, react-dom ^18.3.1`, devDependencies는 13클루와 동일 + `vitest ^2.1.8`, scripts: `dev`/`build`/`server`는 13클루와 같게, `"test": "vitest run"`. `.gitignore`: `node_modules`, `dist`, `index.html` 제외 안 함(배포물이므로 커밋).
- [ ] **Step 3:** `src/game/smoke.test.ts`에 `expect(1 + 1).toBe(2)` 하나. `App.tsx`는 "컬러팡" 제목만 렌더.
- [ ] **Step 4:** `npm install` 후 `npm test` → 1 passed. `npm run build` → 루트 `index.html` 생성 확인.
- [ ] **Step 5:** 커밋 `chore: scaffold colorpang project`.

---

### Task 2: 카드와 덱

**Files:**
- Create: `src/game/types.ts`, `src/game/deck.ts`, `src/game/deck.test.ts`
- Delete: `src/game/smoke.test.ts`

**Interfaces:**
- Produces:
```ts
export type Color = 'red' | 'yellow' | 'green' | 'blue';
export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];
export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export interface Card { id: string; kind: CardKind; color: Color | null; value: number | null }
// id는 덱 안에서 유일, 예: 'r7a','r7b','gS1','W2','F3'
export type Rng = () => number; // [0,1)
export function makeRng(seed: number): Rng;            // mulberry32
export function createDeck(): Card[];                  // 108장, 정렬된 순서
export function shuffle<T>(arr: T[], rng: Rng): T[];   // 새 배열 반환 (Fisher–Yates)
```

- [ ] **Step 1: 실패하는 테스트** `deck.test.ts`:
  - `createDeck has 108 unique cards`: 길이 108, id Set 크기 108.
  - `composition`: number 76장(각 색 19장, 값 0은 색마다 1장), skip/reverse/draw2 각 8장, wild 4, wild4 4, wild·wild4의 color는 null.
  - `shuffle is deterministic per seed and keeps cards`: 같은 seed 두 번 → 같은 순서; 정렬하면 원본과 같음; 원본 배열은 변하지 않음.
- [ ] **Step 2:** `npm test` → FAIL (모듈 없음).
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** 커밋 `feat: card types and deck`.

---

### Task 3: 규칙 엔진

**Files:**
- Modify: `src/game/types.ts`
- Create: `src/game/rules.ts`, `src/game/rules.test.ts`

**Interfaces:**
- Consumes: Task 2 전부.
- Produces (`types.ts`에 추가):
```ts
export interface PlayerState { seat: number; name: string; clientId: string; hand: Card[] }
export type GameEvent =
  | { kind: 'play'; seat: number; card: Card }
  | { kind: 'draw'; seat: number; count: number; forced: boolean }
  | { kind: 'callOne'; seat: number }
  | { kind: 'caught'; seat: number; by: number }
  | { kind: 'timeout'; seat: number }
  | { kind: 'win'; seat: number };
export interface GameState {
  version: number;                // 적용 때마다 +1
  phase: 'playing' | 'finished';
  players: PlayerState[];         // 자리 번호 오름차순 = 차례 순서
  drawPile: Card[];
  discard: Card[];                // 마지막 원소가 바닥 맨 위
  currentColor: Color;
  turn: number;                   // players 인덱스
  direction: 1 | -1;
  pendingDraw: number;            // 쌓인 +2/+4 장수
  drawnCardId: string | null;     // 이번 차례에 뽑은 카드 (낼 수 있을 때만 설정)
  oneCardPending: number | null;  // 한 장 남았는데 아직 [한 장!] 안 누른 자리 번호
  turnStartedAt: number;          // ms, 심판 기기 시각
  winner: number | null;          // 자리 번호
  lastEvent: GameEvent | null;
}
export type Action =
  | { type: 'play'; seat: number; cardId: string; chosenColor?: Color }
  | { type: 'draw'; seat: number }
  | { type: 'pass'; seat: number }     // 뽑은 카드를 내지 않고 끝내기
  | { type: 'callOne'; seat: number }
  | { type: 'catch'; seat: number; target: number }
  | { type: 'timeout' };
export type ApplyResult = { ok: true; state: GameState } | { ok: false; reason: string };
```
- Produces (`rules.ts`):
```ts
export const HAND_SIZE = 7, TURN_MS = 30_000, CATCH_PENALTY = 2;
export function startGame(players: {seat:number;name:string;clientId:string}[], rng: Rng, now: number): GameState;
export function canPlay(state: GameState, card: Card): boolean;
export function applyAction(state: GameState, action: Action, rng: Rng, now: number): ApplyResult;
export function mostCommonColor(hand: Card[]): Color;  // 동률·없음이면 COLORS 순서상 앞
export function currentSeat(state: GameState): number;
```

**규칙 세부 (스펙 4장 그대로):**
- `startGame`: 셔플 후 각자 7장. 첫 카드가 wild4면 덱에 되돌려 다시 셔플·뒤집기 반복. wild면 currentColor는 rng로 고른 색. skip → 첫 사람 건너뜀, reverse → direction -1 (2명이면 skip), draw2 → pendingDraw 2. turn 0, version 1.
- `canPlay`: pendingDraw > 0이면 draw2·wild4만 true. 아니면 wild/wild4 true, 색 == currentColor 또는 (같은 kind이고 number면 같은 value, 기호면 같은 kind) true. drawnCardId가 있으면 그 카드만 낼 수 있음.
- `play`: 차례·카드 소유·canPlay 검사(실패 시 `{ok:false}`). wild/wild4는 chosenColor 필수. 효과: skip → 다음 사람 건너뜀; reverse → 방향 전환(2명이면 skip과 같음); draw2 → pendingDraw += 2; wild4 → pendingDraw += 4. 현재 색 = 카드 색 또는 chosenColor. 손패 0장 → phase finished, winner. 손패 1장 → oneCardPending = 그 자리. 다른 사람의 oneCardPending은 이 시점에 null(다음 사람이 행동했으므로). drawnCardId = null, turnStartedAt = now.
- `draw`: pendingDraw > 0 → 그 장수 뽑고 pendingDraw 0, 차례 넘김. 아니면 1장 뽑고, 낼 수 있으면 drawnCardId 설정(차례 유지), 없으면 차례 넘김. drawnCardId가 이미 있으면 거부. 이전 사람의 oneCardPending은 null로.
- `pass`: drawnCardId가 있을 때만, 차례 넘김.
- `callOne`: oneCardPending === seat이면 null로.
- `catch`: oneCardPending === target이고 seat ≠ target이면 target이 2장 뽑고 oneCardPending null. 아니면 거부.
- `timeout`: now - turnStartedAt ≥ TURN_MS일 때만. drawnCardId 있으면 pass, 아니면 draw와 같은 처리(1장 뽑아 낼 수 있어도 차례 넘김).
- 뽑기 공통: drawPile이 비면 discard 맨 위만 남기고 나머지를 섞어 drawPile로. 그래도 부족하면 있는 만큼만.
- 모든 성공 적용: version + 1, lastEvent 설정. 원본 state는 변경하지 않음.

- [ ] **Step 1: 실패하는 테스트** `rules.test.ts`. 테스트용 헬퍼 `makeState(partial)`로 손패·바닥을 직접 구성. 테스트 이름과 단언:
  - `startGame deals 7 each and never starts on wild4` (seed 1~50 반복)
  - `canPlay matches color, value or symbol`
  - `wild needs chosenColor`
  - `skip skips next player`, `reverse flips direction`, `reverse with 2 players acts as skip`
  - `draw2 stacks: draw2 on draw2 → pendingDraw 4`
  - `wild4 on draw2 → pendingDraw 6`, `draw2 on wild4 allowed and sets color to draw2 color`
  - `only draw cards playable while pendingDraw > 0`
  - `draw with pending takes all and passes turn`
  - `drawn playable card can be played or passed; other cards blocked`
  - `playing to one card sets oneCardPending; callOne clears it`
  - `catch gives target 2 cards; catch after next player acted is rejected`
  - `timeout before 30s rejected; after 30s draws 1 and advances`
  - `timeout with pendingDraw draws the stack`
  - `reshuffles discard when draw pile empties`, `draws only what exists`
  - `last card wins and finishes game; actions after finish rejected`
  - `mostCommonColor ignores wilds, ties broken by COLORS order`
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** 위 시그니처대로 구현.
- [ ] **Step 4:** `npm test` → 모두 PASS.
- [ ] **Step 5:** 커밋 `feat: rules engine with stacking, one-card call, timeout`.

---

### Task 4: 카드 디자인 + 선생님 확인

**Files:**
- Create: `src/ui/CardView.tsx`, `src/ui/CardBack.tsx`, `src/ui/CardGallery.tsx`
- Modify: `src/App.tsx` (URL에 `?gallery`가 있으면 CardGallery 렌더), `src/index.css`

**Interfaces:**
- Consumes: `Card`, `Color`.
- Produces: `<CardView card={Card} size?: 'sm'|'md'|'lg' playable?: boolean onClick?: () => void />`, `<CardBack size?: 'sm'|'md'|'lg' />`, CSS 변수 `--c-red --c-yellow --c-green --c-blue`.

- [ ] **Step 1:** 카드를 SVG로 디자인: 둥근 사각형, 가운데 큰 숫자/아이콘, 네 모서리에 작은 숫자 + 색 기호(●★▲◆). 특수카드 아이콘: 건너뛰기(⊘ 대신 자체 그린 '멈춤 손바닥'), 방향 바꾸기(둥근 화살표 두 개), +2(카드 두 장 겹침), 무지개(4색 조각 원), 무지개+4. 뒷면은 "컬러팡" 로고 + 별 패턴. 원작의 기울어진 타원 문양 금지.
- [ ] **Step 2:** `CardGallery`에 108장 전체(종류별 1장씩 묶어도 됨)와 뒷면을 그리드로 표시.
- [ ] **Step 3:** `npm run dev` → 브라우저 패널에서 `http://localhost:5173/?gallery` 스크린샷.
- [ ] **Step 4: 선생님 확인 (게이트).** 스크린샷을 보여주고 승인받는다. 수정 요청이 있으면 반영 후 다시 확인. 승인 전에는 Task 7(화면)로 넘어가지 않는다.
- [ ] **Step 5:** 커밋 `feat: original card designs`.

---

### Task 5: 통신 프로토콜과 방 로직 (순수 함수)

**Files:**
- Create: `src/net/protocol.ts`, `src/net/room.ts`, `src/net/room.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Action`.
- Produces (`protocol.ts`):
```ts
export interface Seat { name: string; clientId: string }
export interface LobbyState { version: number; hostId: string; seats: Record<number, Seat>; started: boolean }
export type NetMessage =
  | { type: 'HELLO'; clientId: string }                                   // 입장 직후, 스냅샷 요청 겸용
  | { type: 'CLAIM_SEAT'; clientId: string; seat: number; name: string }
  | { type: 'LEAVE_SEAT'; clientId: string }
  | { type: 'LOBBY'; lobby: LobbyState }
  | { type: 'START'; clientId: string }
  | { type: 'REMATCH'; clientId: string }
  | { type: 'ACTION'; clientId: string; action: Action }
  | { type: 'SNAPSHOT'; hostId: string; state: GameState; sentAt: number }
  | { type: 'HEARTBEAT'; clientId: string; seat: number | null; isHost: boolean; version: number; sentAt: number }
  | { type: 'REJECT'; clientId: string; reason: string };                 // 특정 사람에게 거절 알림
```
- Produces (`room.ts`):
```ts
export const HEARTBEAT_MS = 2_000, HOST_TIMEOUT_MS = 6_000, MAX_PLAYERS = 4;
export function newRoomCode(rng: () => number): string;                  // '000000'~'999999', 6자리 패딩
export function claimSeat(lobby: LobbyState, clientId: string, seat: number, name: string): { ok: true; lobby: LobbyState } | { ok: false; reason: string };
export function leaveSeat(lobby: LobbyState, clientId: string): LobbyState;
export function seatOf(lobby: LobbyState, clientId: string): number | null;
export function electHost(lastSeen: Record<string, { seat: number | null; at: number }>, currentHostId: string, now: number): string;
export function acceptSnapshot(current: GameState | null, incoming: GameState): boolean;
export function rebaseTurnStart(state: GameState, sentAt: number, receivedAt: number): GameState;
```
- 규칙:
  - `claimSeat`: seat 1~4만. 이미 같은 clientId가 앉아 있으면 자리 이동(게임 전) 또는 그대로 성공(같은 자리, 재입장). 다른 사람 자리면 거부. `started`이면 이미 앉아 있던 clientId만 성공(재입장), 새 사람은 `reason: '이미 시작된 방이에요'`.
  - `electHost`: currentHostId가 6초 안에 보였으면 그대로. 아니면 6초 안에 보인 사람 중 seat가 가장 작은 사람(좌석 없는 사람은 뒤, 동률은 clientId 사전순).
  - `acceptSnapshot`: current가 null이거나 incoming.version > current.version.
  - `rebaseTurnStart`: turnStartedAt를 수신 기기 시각으로 옮김 = turnStartedAt + (receivedAt − sentAt).

- [ ] **Step 1: 실패하는 테스트** `room.test.ts`:
  - `newRoomCode is 6 digits`
  - `claimSeat rejects taken seat`, `claimSeat moves own seat before start`, `claimSeat restores same client`, `claimSeat rejects newcomer during game`, `claimSeat rejects seat 5`
  - `electHost keeps live host`, `electHost picks lowest live seat after 6s`, `electHost ignores stale peers`
  - `acceptSnapshot ignores stale versions` (같은 버전, 낮은 버전 → false)
  - `rebaseTurnStart keeps remaining time` (sentAt 1000, receivedAt 51000, turnStartedAt 500 → 50500)
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** 커밋 `feat: room protocol, seat claims, host election`.

---

### Task 6: 실시간 채널과 useRoom 훅

**Files:**
- Create: `src/net/realtime.ts` (13클루 `src/logic/realtime.ts` 복사 후 수정), `src/net/useRoom.ts`

**Interfaces:**
- Consumes: Task 3 `startGame/applyAction`, Task 5 전부.
- Produces:
```ts
// realtime.ts — 13클루와 동일한 클래스, 다음만 변경:
//   RealtimeEvent → NetMessage, 토픽 'colorpang_v1/room_'+roomId, BroadcastChannel 이름 'colorpang_v1_room_'+roomId,
//   localStorage 'colorpang_relay_server', MQTT clientId 접두어 'colorpang_'.
//   추가: 페이지가 개인 서버(http/https)에서 열렸고 localStorage 값이 없으면 같은 호스트의 ws(s):// 주소를 자동 사용.
export const CLIENT_ID: string; // localStorage 'colorpang_client_id'에 저장해 새로고침에도 유지
export class RealtimeChannel { constructor(roomId: string); publish(m: NetMessage): void; subscribe(cb: (m: NetMessage) => void): () => void; onStatus(cb: (online: boolean, provider: string) => void): () => void; destroy(): void }

// useRoom.ts
export interface RoomApi {
  roomCode: string; myId: string; mySeat: number | null; isHost: boolean;
  online: boolean; provider: string;
  lobby: LobbyState | null; game: GameState | null;
  peersOnline: Record<number, boolean>;          // 자리별 최근 6초 내 생존 여부
  claimSeat(seat: number, name: string): void; leaveSeat(): void;
  start(): void; rematch(): void; act(a: Action): void; leave(): void;
  error: string | null;                           // REJECT 메시지 표시용
}
export function useRoom(roomCode: string, mode: 'create' | 'join'): RoomApi;
```
- 동작:
  - create: 내가 hostId인 LobbyState(version 1)로 시작. join: `HELLO` 보내고 LOBBY/SNAPSHOT 기다림. 5초 안에 응답 없으면 error "방을 찾을 수 없어요. 코드를 확인해 주세요".
  - 모두 `HEARTBEAT`를 2초마다 보냄. lastSeen을 갱신하고 1초마다 `electHost` 실행 → 결과가 나면 isHost.
  - 심판: CLAIM_SEAT/LEAVE_SEAT/START/REMATCH/ACTION을 순수 함수로 처리 → `LOBBY`나 `SNAPSHOT` 발송(실패는 해당 clientId에 `REJECT`). HELLO를 받으면 최신 LOBBY와(게임 중이면) SNAPSHOT 재발송. HEARTBEAT의 version이 내 것보다 낮은 기기가 있으면 SNAPSHOT 재발송. 500ms마다 timeout 검사 → `applyAction({type:'timeout'})` 성공 시 발송.
  - 심판이 된 순간: 받은 마지막 스냅샷과 로비를 이어받아 hostId만 자기로 바꾸고 lobby.version+1로 즉시 발송.
  - 비심판: `act`는 ACTION 발송만(낙관적 반영 없음). SNAPSHOT 수신 시 `acceptSnapshot` → `rebaseTurnStart` 후 저장.
  - START는 lobby.hostId 본인만 가능, 2명 이상. REMATCH는 finished일 때 hostId만.
  - 재입장 정보 `colorpang_session` = `{roomCode, seat, name}` 저장, Home에서 "이어서 하기" 표시용.

- [ ] **Step 1:** realtime.ts 이식, `npx tsc --noEmit` 통과.
- [ ] **Step 2:** useRoom 구현, `npx tsc --noEmit` 통과.
- [ ] **Step 3:** 임시 디버그 화면(App에 `?debug`)에서 두 탭을 열어 로비 자리 선택이 서로 보이는지 확인 (BroadcastChannel + MQTT).
- [ ] **Step 4:** 커밋 `feat: realtime channel and room hook with host takeover`.

---

### Task 7: 화면

**Files:**
- Create: `src/ui/HomeScreen.tsx`, `src/ui/LobbyScreen.tsx`, `src/ui/GameScreen.tsx`, `src/ui/ResultScreen.tsx`, `src/ui/ColorPicker.tsx`, `src/ui/TurnTimer.tsx`, `src/ui/SettingsModal.tsx`, `src/ui/RulesModal.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `RoomApi`, `CardView`, `CardBack`, `canPlay`, `mostCommonColor`, `TURN_MS`, `currentSeat`.

- [ ] **Step 1: Home** — [방 만들기] / [방 코드로 입장](큰 숫자 키패드, 6자리) / [규칙 보기] / ⚙️(개인 서버 주소 저장·삭제, 13클루 SettingsModal과 같은 문구 흐름) / 저장된 세션이 있으면 [이어서 하기].
- [ ] **Step 2: Lobby** — 방 코드 크게 표시, 자리 1~4 버튼(빈 자리/⭐ 내 자리/👤 이름, 연결 끊김은 흐리게), 이름 입력, 참여 현황, 연결 상태(🟢 공용 클라우드/개인 서버), 방장에게만 [게임 시작](2명 이상일 때 활성).
- [ ] **Step 3: Game** — 스펙 5-2 배치. 위쪽 다른 사람(이름, 카드 뒷면 수, 차례 강조, 연결 끊김 표시, "한 장!" 배지). 가운데 더미(탭=뽑기)·바닥 카드·현재 색 표시·방향 표시·"+N 쌓임". 아래 내 손패(낼 수 있는 카드는 위로 떠 있음, 많으면 겹침+가로 스크롤). drawnCardId가 있으면 [내기]/[넘기기]. 내가 oneCardPending이면 [한 장!], 다른 사람이 oneCardPending이면 [잡았다!]. 차례 테두리 강조. 내기 애니메이션은 CSS transform으로 바닥까지 이동.
- [ ] **Step 4: ColorPicker / TurnTimer** — 와일드 탭 → 4색 선택창. TurnTimer는 `turnStartedAt` 기준 남은 시간 막대, 5초 이하 깜빡임. 색 선택창이 열린 채 남은 시간이 1초 이하가 되면 `mostCommonColor(내 손패)`로 자동 전송.
- [ ] **Step 5: Result / Rules** — 우승자 표시 + 각자 남은 카드 수, 방장 [한 판 더], 모두 [나가기]. RulesModal은 스펙 4장 규칙을 초등학생 말투로.
- [ ] **Step 6: 확인** — 브라우저 패널에서 탭 3개(방장 1 + 참가 2)로 한 판 끝까지: 쌓기(+2→+4→+2), 방향 바꾸기, 와일드 색 고르기, 한 장!/잡았다!, 30초 시간 초과, 승리 → 한 판 더. 태블릿 크기(1024×768, 1180×820) 스크린샷.
- [ ] **Step 7:** 커밋 `feat: home, lobby, game and result screens`.

---

### Task 8: 끊김·이어받기 실제 확인

**Files:** (버그가 나오면 해당 파일 수정)

- [ ] **Step 1:** 탭 3개로 게임 중 방장 탭 닫기 → 6~8초 안에 자리 번호 빠른 사람이 심판, 게임 계속, 타이머 이어짐 확인.
- [ ] **Step 2:** 참가자 탭 새로고침 → [이어서 하기]로 같은 자리·같은 손패 복귀 확인.
- [ ] **Step 3:** 연결 끊긴 사람 차례가 30초 뒤 자동 진행되는지 확인.
- [ ] **Step 4:** BroadcastChannel을 끈 상태(`?nobc` 플래그로 비활성화 — realtime.ts에 추가)에서 공용 MQTT만으로 Step 1~3 재확인.
- [ ] **Step 5:** 커밋 `fix: host takeover and reconnect verified` (변경 있을 때).

---

### Task 9: 개인 서버, 빌드, 배포 안내

**Files:**
- Create: `server.cjs`, `실시간_서버_실행.bat`, `방화벽_8080포트_허용.bat`, `배포_안내_가이드.md`
- Modify: `package.json` (dependencies에 `ws ^8.18.0`)

- [ ] **Step 1:** 13클루 `server.cjs`·bat 파일 복사, 콘솔 문구를 "컬러팡"으로, health 응답 server 이름 `colorpang-relay`.
- [ ] **Step 2:** `npm run build` → 루트 `index.html` 하나로 생성, 파일 크기 기록 (목표 2MB 이하).
- [ ] **Step 3:** `npm run server` → 브라우저 패널에서 `http://localhost:8080` 탭 2개로 로비 연동 확인(개인 서버 경로).
- [ ] **Step 4:** `배포_안내_가이드.md` — 13클루 가이드 구성 그대로: 실시간 방식(공용 클라우드 기본 / 교실 로컬 서버 / GitHub Pages 배포 / Render 개인 서버 단계), 방 코드 안내, 게임 진행 안내, 규칙 요약. '우노' 단어 사용 금지.
- [ ] **Step 5:** `npm test` 전체 PASS 확인 후 커밋 `feat: relay server, single-file build, deploy guide`.
