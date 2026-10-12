import {
  Card,
  GameState,
  PublicGameState,
  PublicPileView,
  PublicPlayerView,
  Rank,
  RANKS,
  SUITS,
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
    serverNow: now,
  };
}
