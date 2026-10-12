import { describe, it, expect } from 'vitest';
import {
  maxCardsPerPlayer,
  recommendedCardsPerPlayer,
  sortCards,
  CardSchema,
  PublicGameStateSchema,
  GameState,
  Card,
  PileEntry,
} from '@bluff/shared';
import {
  createDeck,
  shuffle,
  dealCards,
  startGame,
  toPublicState,
} from '../engine/game.js';
import {
  createRoom,
  joinRoom,
  updateSettings,
} from '../engine/room.js';
import { RoomManager } from '../room-manager.js';

// Simple deterministic Mulberry32 PRNG for reproducible test sequences
function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Slice 2: Deck and Dealing Engine', () => {
  it('deck has 52 unique cards matching schema and distributions', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);

    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(52);

    for (const card of deck) {
      expect(CardSchema.safeParse(card).success).toBe(true);
      expect(card.id).toBe(`${card.suit}-${card.rank}`);
    }

    const suitCounts: Record<string, number> = {};
    const rankCounts: Record<string, number> = {};
    for (const card of deck) {
      suitCounts[card.suit] = (suitCounts[card.suit] ?? 0) + 1;
      rankCounts[card.rank] = (rankCounts[card.rank] ?? 0) + 1;
    }

    expect(Object.keys(suitCounts)).toHaveLength(4);
    for (const count of Object.values(suitCounts)) {
      expect(count).toBe(13);
    }

    expect(Object.keys(rankCounts)).toHaveLength(13);
    for (const count of Object.values(rankCounts)) {
      expect(count).toBe(4);
    }
  });

  it('seeded shuffle is a permutation of the deck', () => {
    const deck = createDeck();
    const rng1 = createMulberry32(12345);
    const shuffled1 = shuffle(deck, rng1);

    expect(shuffled1).toHaveLength(52);
    // Permutation contains all original card IDs
    const originalIds = new Set(deck.map((c) => c.id));
    const shuffledIds = new Set(shuffled1.map((c) => c.id));
    expect(shuffledIds).toEqual(originalIds);

    // Not in the exact original order
    const isDifferentOrder = shuffled1.some((card, i) => card.id !== deck[i].id);
    expect(isDifferentOrder).toBe(true);

    // Deterministic: same seed produces identical sequence
    const rng2 = createMulberry32(12345);
    const shuffled2 = shuffle(deck, rng2);
    expect(shuffled1.map((c) => c.id)).toEqual(shuffled2.map((c) => c.id));

    // Different seed produces different sequence
    const rng3 = createMulberry32(99999);
    const shuffled3 = shuffle(deck, rng3);
    expect(shuffled1.map((c) => c.id)).not.toEqual(shuffled3.map((c) => c.id));
  });

  it('maxCardsPerPlayer for 2–8 players produces exact (15,15,13,10,8,7,6)', () => {
    const expected = [15, 15, 13, 10, 8, 7, 6];
    const actual = [2, 3, 4, 5, 6, 7, 8].map((n) => maxCardsPerPlayer(n));
    expect(actual).toEqual(expected);
  });

  it('recommendedCardsPerPlayer never exceeds the max for 2–8 players', () => {
    for (let p = 2; p <= 8; p++) {
      const rec = recommendedCardsPerPlayer(p);
      const max = maxCardsPerPlayer(p);
      expect(rec).toBeLessThanOrEqual(max);
      expect(rec).toBeGreaterThanOrEqual(3);
    }

    // Explicit checks: 2–3 -> 10, 4–5 -> 7, 6–8 -> 5
    expect(recommendedCardsPerPlayer(2)).toBe(10);
    expect(recommendedCardsPerPlayer(3)).toBe(10);
    expect(recommendedCardsPerPlayer(4)).toBe(7);
    expect(recommendedCardsPerPlayer(5)).toBe(7);
    expect(recommendedCardsPerPlayer(6)).toBe(5);
    expect(recommendedCardsPerPlayer(7)).toBe(5);
    expect(recommendedCardsPerPlayer(8)).toBe(5);
  });

  it('deal gives exact counts with no duplicate ids', () => {
    const deck = createDeck();
    const playerIds = ['p1', 'p2', 'p3'];
    const cardsPerPlayer = 7;

    const hands = dealCards(deck, playerIds, cardsPerPlayer);

    expect(Object.keys(hands)).toHaveLength(3);
    for (const id of playerIds) {
      expect(hands[id]).toHaveLength(cardsPerPlayer);
    }

    const allDealtIds = new Set<string>();
    for (const id of playerIds) {
      for (const card of hands[id]) {
        expect(allDealtIds.has(card.id)).toBe(false);
        allDealtIds.add(card.id);
      }
    }
    expect(allDealtIds.size).toBe(21);

    // Verify round-robin: p1 gets deck[0], p2 gets deck[1], p3 gets deck[2], p1 gets deck[3]...
    expect(hands['p1'][0].id).toBe(deck[0].id);
    expect(hands['p2'][0].id).toBe(deck[1].id);
    expect(hands['p3'][0].id).toBe(deck[2].id);
    expect(hands['p1'][1].id).toBe(deck[3].id);
  });

  it('sortCards sorts by rank then suit deterministically', () => {
    const unsorted: Card[] = [
      { id: 'S-K', suit: 'S', rank: 'K' },
      { id: 'H-A', suit: 'H', rank: 'A' },
      { id: 'D-A', suit: 'D', rank: 'A' },
      { id: 'C-7', suit: 'C', rank: '7' },
    ];

    const sorted = sortCards(unsorted);
    expect(sorted.map((c) => c.id)).toEqual(['H-A', 'D-A', 'C-7', 'S-K']);
  });
});

describe('Slice 2: Settings Validation & Auto-Clamp', () => {
  it('validates settings updates: host only, lobby only, valid range', () => {
    const { room, hostPlayer } = createRoom('CODE12', 'Alice');

    // Default setting for 1 player is 10 in auto mode
    expect(room.settings.cardsPerPlayer).toBe(10);
    expect(room.cardsPerPlayerSource).toBe('auto');

    // Non-host cannot update settings
    const nonHostRes = updateSettings(room, 'random-id', 7);
    expect(nonHostRes.ok).toBe(false);
    if (!nonHostRes.ok) {
      expect(nonHostRes.code).toBe('NOT_HOST');
    }

    // Invalid range < 3 rejected
    const tooLowRes = updateSettings(room, hostPlayer.playerId, 2);
    expect(tooLowRes.ok).toBe(false);
    if (!tooLowRes.ok) {
      expect(tooLowRes.code).toBe('INVALID_CARDS_PER_PLAYER');
    }

    // Invalid range > max rejected (with 1 player, max is 15)
    const tooHighRes = updateSettings(room, hostPlayer.playerId, 16);
    expect(tooHighRes.ok).toBe(false);

    // Valid update by host switches source to 'host'
    const validRes = updateSettings(room, hostPlayer.playerId, 7);
    expect(validRes.ok).toBe(true);
    expect(room.settings.cardsPerPlayer).toBe(7);
    expect(room.cardsPerPlayerSource).toBe('host');
  });

  it('auto-updates settings while source is auto as players join/leave', () => {
    const { room } = createRoom('CODE12', 'Alice');
    expect(room.settings.cardsPerPlayer).toBe(10);

    // 2nd player joins -> recommended is 10
    joinRoom(room, 'Bob');
    expect(room.settings.cardsPerPlayer).toBe(10);

    // 3rd player joins -> recommended is 10
    joinRoom(room, 'Charlie');
    expect(room.settings.cardsPerPlayer).toBe(10);

    // 4th player joins -> recommended is 7
    joinRoom(room, 'David');
    expect(room.settings.cardsPerPlayer).toBe(7);

    // 6th player joins -> recommended is 5
    joinRoom(room, 'Eve');
    joinRoom(room, 'Frank');
    expect(room.settings.cardsPerPlayer).toBe(5);
  });

  it('clamps host settings when player joins and lowers max below current value', () => {
    const { room, hostPlayer } = createRoom('CODE12', 'Alice');
    joinRoom(room, 'Bob'); // 2 players: max is 15

    // Host manually sets to 10
    updateSettings(room, hostPlayer.playerId, 10);
    expect(room.settings.cardsPerPlayer).toBe(10);
    expect(room.cardsPerPlayerSource).toBe('host');

    // Add players up to 5: max is 10, so 10 is still valid
    joinRoom(room, 'Charlie'); // 3
    joinRoom(room, 'David'); // 4
    const res5 = joinRoom(room, 'Eve'); // 5 players, max = min(15, 52/5) = 10
    expect(res5.ok).toBe(true);
    if (res5.ok) {
      expect(res5.clamped).toBe(false);
    }
    expect(room.settings.cardsPerPlayer).toBe(10);

    // 6th player joins: max is 8. Since current is 10, it must clamp to 8!
    const res6 = joinRoom(room, 'Frank');
    expect(res6.ok).toBe(true);
    if (res6.ok) {
      expect(res6.clamped).toBe(true);
      expect(res6.clampedCardsPerPlayer).toBe(8);
    }
    expect(room.settings.cardsPerPlayer).toBe(8);
  });

  it('RoomManager startGame validates player count and settings', () => {
    const manager = new RoomManager();
    const { room, hostPlayer } = manager.createRoom('Alice');

    // Cannot start with < 2 players
    const fail1 = manager.startGame(room.roomCode, hostPlayer.playerId);
    expect(fail1.ok).toBe(false);
    if (!fail1.ok) {
      expect(fail1.code).toBe('NOT_ENOUGH_PLAYERS');
    }

    // Add Bob
    const joinRes = manager.joinRoom(room.roomCode, 'Bob');
    expect(joinRes.ok).toBe(true);
    const bob = (joinRes as { ok: true; player: { playerId: string } }).player;

    // Non-host cannot start
    const fail2 = manager.startGame(room.roomCode, bob.playerId);
    expect(fail2.ok).toBe(false);
    if (!fail2.ok) {
      expect(fail2.code).toBe('NOT_HOST');
    }

    // Host starts successfully
    const startRes = manager.startGame(room.roomCode, hostPlayer.playerId);
    expect(startRes.ok).toBe(true);
    if (startRes.ok) {
      expect(startRes.gameState.status).toBe('PLAYING');
      expect(startRes.gameState.requiredRank).toBe('A');
      expect(startRes.gameState.playSeq).toBe(0);
      expect(startRes.gameState.players).toHaveLength(2);
      expect(startRes.gameState.turnOrder).toHaveLength(2);
      expect(startRes.gameState.turnOrder).toContain(startRes.gameState.currentTurnId);
      expect(startRes.gameState.players[0].hand).toHaveLength(10);
      expect(startRes.gameState.players[1].hand).toHaveLength(10);
    }
  });
});

describe('Slice 2: Security Boundary & Leak Assertion', () => {
  it('LEAK TEST — build a view for player A, JSON.stringify it, and assert no card id from any other hand or pile appears, and no sessionToken appears', () => {
    const secretSessionTokenA = 'secret-token-alice-12345';
    const secretSessionTokenB = 'secret-token-bob-67890';
    const secretSessionTokenC = 'secret-token-charlie-abcde';

    const playerAId = '11111111-1111-4111-8111-111111111111';
    const playerBId = '22222222-2222-4222-8222-222222222222';
    const playerCId = '33333333-3333-4333-8333-333333333333';

    const fullDeck = createDeck();
    const handA = fullDeck.slice(0, 7);
    const handB = fullDeck.slice(7, 14);
    const handC = fullDeck.slice(14, 21);
    const pileCards = fullDeck.slice(21, 24);

    const pileEntry: PileEntry = {
      playSeq: 1,
      playerId: playerBId,
      cards: pileCards,
      declaredRank: 'A',
      count: pileCards.length,
    };

    const gameState: GameState = {
      roomCode: 'ABCD23',
      hostId: playerAId,
      status: 'PLAYING',
      settings: { cardsPerPlayer: 7 },
      players: [
        { playerId: playerAId, name: 'Alice', hand: handA },
        { playerId: playerBId, name: 'Bob', hand: handB },
        { playerId: playerCId, name: 'Charlie', hand: handC },
      ],
      turnOrder: [playerAId, playerBId, playerCId],
      currentTurnId: playerAId,
      requiredRank: 'A',
      centralPile: [pileEntry],
      playSeq: 1,
    };

    // Public state generated for Player A
    const publicStateA = toPublicState(gameState, playerAId);
    expect(PublicGameStateSchema.safeParse(publicStateA).success).toBe(true);

    const serialized = JSON.stringify(publicStateA);

    // 1. Session tokens must never be present
    expect(serialized).not.toContain(secretSessionTokenA);
    expect(serialized).not.toContain(secretSessionTokenB);
    expect(serialized).not.toContain(secretSessionTokenC);
    expect(serialized).not.toContain('sessionToken');

    // 2. Card IDs from Player B must NOT appear
    for (const cardB of handB) {
      expect(serialized).not.toContain(`"${cardB.id}"`);
      expect(serialized).not.toContain(cardB.id);
    }

    // 3. Card IDs from Player C must NOT appear
    for (const cardC of handC) {
      expect(serialized).not.toContain(`"${cardC.id}"`);
      expect(serialized).not.toContain(cardC.id);
    }

    // 4. Card IDs from the face-down pile must NOT appear
    for (const pileCard of pileCards) {
      expect(serialized).not.toContain(`"${pileCard.id}"`);
      expect(serialized).not.toContain(pileCard.id);
    }

    // 5. Player A's own cards MUST appear in myHand
    for (const cardA of handA) {
      expect(serialized).toContain(`"${cardA.id}"`);
    }

    // 6. Pile must only contain count and lastPlay summary without card identities
    expect(publicStateA.pile.count).toBe(3);
    expect(publicStateA.pile.lastPlay).toEqual({
      playSeq: 1,
      playerId: playerBId,
      declaredRank: 'A',
      count: 3,
    });
    // Check that 'cards' property doesn't exist on public pile
    expect('cards' in (publicStateA.pile.lastPlay ?? {})).toBe(false);

    // 7. Opponents must have only handCount, never hand or cards
    const opponentBView = publicStateA.players.find((p) => p.playerId === playerBId);
    expect(opponentBView).toBeDefined();
    expect(opponentBView?.handCount).toBe(7);
    expect('hand' in (opponentBView ?? {})).toBe(false);
    expect('cards' in (opponentBView ?? {})).toBe(false);
  });
});
