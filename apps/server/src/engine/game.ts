import { randomUUID } from 'crypto';
import {
  Card,
  ChallengeResult,
  GameState,
  PileEntry,
  PublicGameState,
  PublicPileView,
  PublicPlayerView,
  Rank,
  RANKS,
  RoomStatus,
  SUITS,
  getNextRank,
} from '@bluff/shared';

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
      });
    }
  }
  return cards;
}

export function shuffle(
  cards: readonly Card[],
  rng: () => number = Math.random
): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function dealCards(
  deck: readonly Card[],
  playerIds: readonly string[],
  cardsPerPlayer: number
): Record<string, Card[]> {
  const hands: Record<string, Card[]> = {};
  for (const id of playerIds) {
    hands[id] = [];
  }

  let deckIndex = 0;
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (const id of playerIds) {
      if (deckIndex < deck.length) {
        hands[id].push(deck[deckIndex++]);
      }
    }
  }

  return hands;
}

export interface StartGameRoomInput {
  roomCode: string;
  hostId: string;
  players: { playerId: string; name: string }[];
  settings: { cardsPerPlayer: number };
}

export function startGame(
  room: StartGameRoomInput,
  rng: () => number = Math.random
): GameState {
  const turnOrder = room.players.map((p) => p.playerId);
  if (turnOrder.length < 2) {
    throw new Error('Cannot start game with fewer than 2 players');
  }

  const firstPlayerIdx = Math.floor(rng() * turnOrder.length);
  const currentTurnId = turnOrder[firstPlayerIdx];

  const deck = createDeck();
  const shuffled = shuffle(deck, rng);
  const hands = dealCards(shuffled, turnOrder, room.settings.cardsPerPlayer);

  const players = room.players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    hand: hands[p.playerId] ?? [],
  }));

  return {
    gameId: randomUUID(),
    roomCode: room.roomCode,
    hostId: room.hostId,
    status: 'PLAYING',
    settings: {
      cardsPerPlayer: room.settings.cardsPerPlayer,
    },
    players,
    turnOrder,
    currentTurnId,
    requiredRank: 'A' as Rank,
    centralPile: [],
    playSeq: 0,
  };
}

export function toPublicState(
  state: GameState,
  viewerId: string,
  connectedMap?: Record<string, boolean>,
  now: number = Date.now()
): PublicGameState {
  const viewer = state.players.find((p) => p.playerId === viewerId);
  const myHand = viewer ? [...viewer.hand] : [];

  const publicPlayers: PublicPlayerView[] = state.players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    connected: connectedMap ? (connectedMap[p.playerId] ?? true) : true,
    handCount: p.hand.length,
  }));

  const lastEntry =
    state.centralPile.length > 0
      ? state.centralPile[state.centralPile.length - 1]
      : null;
  const pileCount = state.centralPile.reduce((acc, entry) => acc + entry.count, 0);

  const publicPile: PublicPileView = {
    count: pileCount,
    lastPlay: lastEntry
      ? {
          playSeq: lastEntry.playSeq,
          playerId: lastEntry.playerId,
          declaredRank: lastEntry.declaredRank,
          count: lastEntry.count,
        }
      : null,
  };

  return {
    roomCode: state.roomCode,
    hostId: state.hostId,
    status: state.status,
    settings: { ...state.settings },
    players: publicPlayers,
    myHand,
    turnOrder: [...state.turnOrder],
    currentTurnId: state.currentTurnId,
    requiredRank: state.requiredRank,
    pile: publicPile,
    playSeq: state.playSeq,
    winnerId: state.winnerId,
    finalCallDeadline: state.finalCallDeadline ?? null,
    pausedFrom: state.pausedFrom ?? null,
    finalCallRemainingMs: state.finalCallRemainingMs ?? null,
    rejoinDeadline: state.rejoinDeadline ?? null,
    endedReason: state.endedReason ?? null,
    abandonedPlayerName: state.abandonedPlayerName ?? null,
    serverNow: now,
  };
}

export function pauseGame(
  state: GameState,
  now: number = Date.now(),
  graceMs: number = 60_000
): GameState {
  if (state.status !== 'PLAYING' && state.status !== 'FINAL_CALL') {
    return state;
  }

  const pausedFrom = state.status;
  let finalCallRemainingMs: number | null = null;
  if (pausedFrom === 'FINAL_CALL' && state.finalCallDeadline) {
    finalCallRemainingMs = Math.max(0, state.finalCallDeadline - now);
  }

  return {
    ...state,
    status: 'PAUSED',
    pausedFrom,
    finalCallRemainingMs,
    finalCallDeadline: null,
    rejoinDeadline: now + graceMs,
  };
}

export function resumeGame(
  state: GameState,
  now: number = Date.now()
): GameState {
  if (state.status !== 'PAUSED') {
    return state;
  }

  const nextStatus = state.pausedFrom ?? 'PLAYING';
  let finalCallDeadline: number | null = null;

  if (nextStatus === 'FINAL_CALL') {
    const remaining = state.finalCallRemainingMs ?? 10_000;
    finalCallDeadline = now + remaining;
  }

  return {
    ...state,
    status: nextStatus,
    finalCallDeadline,
    rejoinDeadline: null,
  };
}

export function abandonGame(state: GameState, abandonedPlayerName?: string): GameState {
  return {
    ...state,
    status: 'GAME_OVER',
    endedReason: 'PLAYER_ABANDONED',
    abandonedPlayerName: abandonedPlayerName ?? null,
    winnerId: undefined,
    finalCallDeadline: null,
    rejoinDeadline: null,
  };
}

export type PlayTurnResult =
  | { ok: true; state: GameState }
  | {
      ok: false;
      code:
        | 'GAME_PAUSED'
        | 'GAME_NOT_PLAYING'
        | 'NOT_YOUR_TURN'
        | 'INVALID_CARD_COUNT'
        | 'DUPLICATE_CARDS'
        | 'PLAYER_NOT_FOUND'
        | 'CARD_NOT_IN_HAND';
      message: string;
    };

export function playTurn(
  state: GameState,
  playerId: string,
  cardIds: readonly string[]
): PlayTurnResult {
  if (state.status === 'PAUSED') {
    return {
      ok: false,
      code: 'GAME_PAUSED',
      message: 'Game is paused waiting for players to reconnect',
    };
  }

  if (state.status !== 'PLAYING') {
    return {
      ok: false,
      code: 'GAME_NOT_PLAYING',
      message: `Cannot play cards when game status is ${state.status}`,
    };
  }

  if (playerId !== state.currentTurnId) {
    return {
      ok: false,
      code: 'NOT_YOUR_TURN',
      message: 'It is not your turn',
    };
  }

  if (cardIds.length < 1 || cardIds.length > 4) {
    return {
      ok: false,
      code: 'INVALID_CARD_COUNT',
      message: 'Must play between 1 and 4 cards',
    };
  }

  const uniqueIds = new Set(cardIds);
  if (uniqueIds.size !== cardIds.length) {
    return {
      ok: false,
      code: 'DUPLICATE_CARDS',
      message: 'Card IDs must be unique',
    };
  }

  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) {
    return {
      ok: false,
      code: 'PLAYER_NOT_FOUND',
      message: 'Player not found in game',
    };
  }

  const handMap = new Map<string, Card>(player.hand.map((c) => [c.id, c]));
  const playedCards: Card[] = [];
  for (const id of cardIds) {
    const card = handMap.get(id);
    if (!card) {
      return {
        ok: false,
        code: 'CARD_NOT_IN_HAND',
        message: `Card ${id} is not in player hand`,
      };
    }
    playedCards.push(card);
  }

  const remainingHand = player.hand.filter((c) => !uniqueIds.has(c.id));
  const nextPlaySeq = state.playSeq + 1;

  const pileEntry: PileEntry = {
    playSeq: nextPlaySeq,
    playerId,
    cards: playedCards,
    declaredRank: state.requiredRank,
    count: playedCards.length,
  };

  const nextPile = [...state.centralPile, pileEntry];
  const nextRequiredRank = getNextRank(state.requiredRank);

  const currentTurnIdx = state.turnOrder.indexOf(playerId);
  const nextTurnIdx = (currentTurnIdx + 1) % state.turnOrder.length;
  const nextTurnId = state.turnOrder[nextTurnIdx];

  const updatedPlayers = state.players.map((p) =>
    p.playerId === playerId ? { ...p, hand: remainingHand } : p
  );

  let nextStatus: RoomStatus = state.status;
  let nextWinnerId = state.winnerId;

  if (remainingHand.length === 0) {
    nextStatus = 'FINAL_CALL';
    nextWinnerId = playerId;
  }

  const nextState: GameState = {
    ...state,
    status: nextStatus,
    players: updatedPlayers,
    playSeq: nextPlaySeq,
    centralPile: nextPile,
    requiredRank: nextRequiredRank,
    currentTurnId: nextTurnId,
    winnerId: nextWinnerId,
  };

  return { ok: true, state: nextState };
}

export type CallBluffResult =
  | {
      ok: true;
      state: GameState;
      result: ChallengeResult;
    }
  | {
      ok: false;
      code:
        | 'GAME_PAUSED'
        | 'GAME_NOT_IN_CALLABLE_STATE'
        | 'PILE_EMPTY'
        | 'STALE_CHALLENGE'
        | 'PLAYER_NOT_FOUND'
        | 'CANNOT_CHALLENGE_SELF';
      message: string;
    };

export function callBluff(
  state: GameState,
  challengerId: string,
  playSeq: number
): CallBluffResult {
  if (state.status === 'PAUSED') {
    return {
      ok: false,
      code: 'GAME_PAUSED',
      message: 'Game is paused waiting for players to reconnect',
    };
  }
  if (state.centralPile.length === 0) {
    if (state.playSeq > 0) {
      return {
        ok: false,
        code: 'STALE_CHALLENGE',
        message: 'Challenge is stale',
      };
    }
    return {
      ok: false,
      code: 'PILE_EMPTY',
      message: 'Central pile is empty',
    };
  }

  const latestEntry = state.centralPile[state.centralPile.length - 1];

  if (playSeq !== latestEntry.playSeq) {
    return {
      ok: false,
      code: 'STALE_CHALLENGE',
      message: 'Challenge is stale',
    };
  }

  if (state.status !== 'PLAYING' && state.status !== 'FINAL_CALL') {
    return {
      ok: false,
      code: 'GAME_NOT_IN_CALLABLE_STATE',
      message: `Cannot challenge bluff when game status is ${state.status}`,
    };
  }

  const challenger = state.players.find((p) => p.playerId === challengerId);
  if (!challenger) {
    return {
      ok: false,
      code: 'PLAYER_NOT_FOUND',
      message: 'Player not found in game',
    };
  }

  if (challengerId === latestEntry.playerId) {
    return {
      ok: false,
      code: 'CANNOT_CHALLENGE_SELF',
      message: 'Cannot challenge your own play',
    };
  }

  const accusedId = latestEntry.playerId;
  const truthful = latestEntry.cards.every(
    (card) => card.rank === latestEntry.declaredRank
  );
  const wasBluff = !truthful;

  const loserId = truthful ? challengerId : accusedId;
  const winnerId = truthful ? accusedId : challengerId;

  const allPileCards = state.centralPile.flatMap((entry) => entry.cards);
  const pickedUpCount = allPileCards.length;

  const updatedPlayers = state.players.map((p) =>
    p.playerId === loserId ? { ...p, hand: [...p.hand, ...allPileCards] } : p
  );

  let nextStatus: RoomStatus = 'PLAYING';
  let nextWinnerId: string | undefined = undefined;

  if (state.status === 'FINAL_CALL') {
    if (truthful) {
      nextStatus = 'GAME_OVER';
      nextWinnerId = accusedId;
    } else {
      nextStatus = 'PLAYING';
      nextWinnerId = undefined;
    }
  }

  const nextState: GameState = {
    ...state,
    status: nextStatus,
    players: updatedPlayers,
    centralPile: [],
    currentTurnId: winnerId,
    requiredRank: state.requiredRank,
    winnerId: nextWinnerId,
    finalCallDeadline: null,
  };

  const challengeResult: ChallengeResult = {
    playSeq: latestEntry.playSeq,
    challengerId,
    accusedId,
    declaredRank: latestEntry.declaredRank,
    revealedCards: [...latestEntry.cards],
    wasBluff,
    pickedUpById: loserId,
    pickedUpCount,
  };

  return {
    ok: true,
    state: nextState,
    result: challengeResult,
  };
}
