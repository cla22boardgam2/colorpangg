import { createDeck, shuffle } from './deck';
import { COLORS, type Action, type ApplyResult, type Card, type Color, type GameState, type Rng } from './types';

export const HAND_SIZE = 7;
export const TURN_MS = 30_000;
export const CATCH_PENALTY = 2;

const isDrawCard = (c: Card) => c.kind === 'draw2' || c.kind === 'wild4';
const isWild = (c: Card) => c.kind === 'wild' || c.kind === 'wild4';
const topOf = (s: GameState) => s.discard[s.discard.length - 1];

export function currentSeat(state: GameState): number {
  return state.players[state.turn].seat;
}

export function startGame(
  players: { seat: number; name: string; clientId: string }[],
  rng: Rng,
  now: number,
): GameState {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  let pile = shuffle(createDeck(), rng);
  const hands = ordered.map(() => [] as Card[]);
  for (let i = 0; i < HAND_SIZE; i++) hands.forEach((h) => h.push(pile.shift()!));

  let first = pile.shift()!;
  while (first.kind === 'wild4') {
    pile = shuffle([...pile, first], rng);
    first = pile.shift()!;
  }

  const n = ordered.length;
  let turn = 0;
  let direction: 1 | -1 = 1;
  let pendingDraw = 0;
  if (first.kind === 'skip' || (first.kind === 'reverse' && n === 2)) turn = 1 % n;
  else if (first.kind === 'reverse') direction = -1;
  else if (first.kind === 'draw2') pendingDraw = 2;

  return {
    version: 1,
    phase: 'playing',
    players: ordered.map((p, i) => ({ ...p, hand: hands[i] })),
    drawPile: pile,
    discard: [first],
    currentColor: first.color ?? COLORS[Math.floor(rng() * COLORS.length)],
    turn,
    direction,
    pendingDraw,
    drawnCardId: null,
    oneCardPending: null,
    turnStartedAt: now,
    winner: null,
    lastEvent: null,
  };
}

export function canPlay(state: GameState, card: Card): boolean {
  if (state.drawnCardId !== null && card.id !== state.drawnCardId) return false;
  if (state.pendingDraw > 0) return isDrawCard(card);
  if (isWild(card)) return true;
  if (card.color === state.currentColor) return true;
  const top = topOf(state);
  if (card.kind === 'number') return top.kind === 'number' && top.value === card.value;
  return top.kind === card.kind;
}

export function mostCommonColor(hand: Card[]): Color {
  let best: Color = COLORS[0];
  let bestCount = 0;
  for (const color of COLORS) {
    const count = hand.filter((c) => c.color === color).length;
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

/** draft를 직접 수정. 더미가 비면 바닥 맨 위만 남기고 섞어 채움. 실제로 뽑은 카드 반환 */
function drawInto(draft: GameState, playerIdx: number, count: number, rng: Rng): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (draft.drawPile.length === 0) {
      const top = draft.discard.pop()!;
      draft.drawPile = shuffle(draft.discard, rng);
      draft.discard = [top];
    }
    const card = draft.drawPile.shift();
    if (!card) break;
    draft.players[playerIdx].hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

function advance(draft: GameState, steps: number, now: number) {
  const n = draft.players.length;
  draft.turn = (((draft.turn + draft.direction * steps) % n) + n) % n;
  draft.drawnCardId = null;
  draft.turnStartedAt = now;
}

/** 지금 행동하는 사람이 '한 장' 대상이 아니면 잡기 기회 종료 */
function closeCatchWindow(draft: GameState, actorSeat: number) {
  if (draft.oneCardPending !== null && draft.oneCardPending !== actorSeat) draft.oneCardPending = null;
}

const fail = (reason: string): ApplyResult => ({ ok: false, reason });

export function applyAction(state: GameState, action: Action, rng: Rng, now: number): ApplyResult {
  if (state.phase !== 'playing') return fail('게임이 끝났어요');
  const draft: GameState = structuredClone(state);
  const idxOf = (seat: number) => draft.players.findIndex((p) => p.seat === seat);
  const turnSeat = currentSeat(draft);

  switch (action.type) {
    case 'play': {
      if (action.seat !== turnSeat) return fail('내 차례가 아니에요');
      const player = draft.players[draft.turn];
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return fail('없는 카드예요');
      if (!canPlay(draft, card)) return fail('낼 수 없는 카드예요');
      if (isWild(card) && !action.chosenColor) return fail('색을 골라 주세요');

      closeCatchWindow(draft, action.seat);
      player.hand = player.hand.filter((c) => c.id !== card.id);
      draft.discard.push(card);
      draft.currentColor = isWild(card) ? action.chosenColor! : card.color!;
      draft.lastEvent = { kind: 'play', seat: action.seat, card };

      if (player.hand.length === 0) {
        draft.phase = 'finished';
        draft.winner = action.seat;
        draft.oneCardPending = null;
        draft.drawnCardId = null;
        draft.lastEvent = { kind: 'win', seat: action.seat };
        break;
      }
      if (player.hand.length === 1) draft.oneCardPending = action.seat;

      let steps = 1;
      if (card.kind === 'skip') steps = 2;
      else if (card.kind === 'reverse') {
        if (draft.players.length === 2) steps = 2;
        else draft.direction = draft.direction === 1 ? -1 : 1;
      } else if (card.kind === 'draw2') draft.pendingDraw += 2;
      else if (card.kind === 'wild4') draft.pendingDraw += 4;
      advance(draft, steps, now);
      break;
    }

    case 'draw': {
      if (action.seat !== turnSeat) return fail('내 차례가 아니에요');
      if (draft.drawnCardId !== null) return fail('이미 카드를 뽑았어요');
      closeCatchWindow(draft, action.seat);
      drawForTurn(draft, rng, now, true);
      break;
    }

    case 'pass': {
      if (action.seat !== turnSeat) return fail('내 차례가 아니에요');
      if (draft.drawnCardId === null) return fail('카드를 먼저 뽑아야 해요');
      advance(draft, 1, now);
      break;
    }

    case 'callOne': {
      if (draft.oneCardPending !== action.seat) return fail('지금은 외칠 수 없어요');
      draft.oneCardPending = null;
      draft.lastEvent = { kind: 'callOne', seat: action.seat };
      break;
    }

    case 'catch': {
      if (action.seat === action.target) return fail('자기 자신은 잡을 수 없어요');
      if (idxOf(action.seat) < 0) return fail('참가자가 아니에요');
      if (draft.oneCardPending !== action.target) return fail('잡을 수 없어요');
      drawInto(draft, idxOf(action.target), CATCH_PENALTY, rng);
      draft.oneCardPending = null;
      draft.lastEvent = { kind: 'caught', seat: action.target, by: action.seat };
      break;
    }

    case 'timeout': {
      if (now - draft.turnStartedAt < TURN_MS) return fail('아직 시간이 남았어요');
      closeCatchWindow(draft, turnSeat);
      if (draft.drawnCardId !== null) advance(draft, 1, now);
      else drawForTurn(draft, rng, now, false);
      draft.lastEvent = { kind: 'timeout', seat: turnSeat };
      break;
    }
  }

  // 대상자의 손패가 1장이 아니게 되면 잡기 기회 종료
  if (draft.oneCardPending !== null) {
    const p = draft.players[idxOf(draft.oneCardPending)];
    if (!p || p.hand.length !== 1) draft.oneCardPending = null;
  }
  draft.version = state.version + 1;
  return { ok: true, state: draft };
}

/** 차례인 사람의 뽑기. allowPlayDrawn=false면 낼 수 있어도 차례를 넘김(시간 초과) */
function drawForTurn(draft: GameState, rng: Rng, now: number, allowPlayDrawn: boolean) {
  const seat = currentSeat(draft);
  if (draft.pendingDraw > 0) {
    const drawn = drawInto(draft, draft.turn, draft.pendingDraw, rng);
    draft.pendingDraw = 0;
    draft.lastEvent = { kind: 'draw', seat, count: drawn.length, forced: true };
    advance(draft, 1, now);
    return;
  }
  const [card] = drawInto(draft, draft.turn, 1, rng);
  draft.lastEvent = { kind: 'draw', seat, count: card ? 1 : 0, forced: false };
  if (allowPlayDrawn && card && canPlay(draft, card)) {
    draft.drawnCardId = card.id;
    return;
  }
  advance(draft, 1, now);
}
