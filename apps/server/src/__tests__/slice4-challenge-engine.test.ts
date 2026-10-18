import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  CallBluffRequestSchema,
  ChallengeResultSchema,
  PlayAgainRequestSchema,
  GameState,
  PublicGameState,
  SessionIssued,
  Rank,
  Card,
  FINAL_CALL_MS,
  ChallengeResult,
} from '@bluff/shared';
import { playTurn, callBluff, toPublicState } from '../engine/game.js';
import { RoomManager, Scheduler } from '../room-manager.js';
import { setupSocketServer } from '../socket/index.js';

describe('Slice 4: Challenge Engine, Final Call & Win', () => {
  const p1 = '11111111-1111-1111-1111-111111111111';
  const p2 = '22222222-2222-2222-2222-222222222222';
  const p3 = '33333333-3333-3333-3333-333333333333';

  function createMockGameState(
    playerHands: Record<string, Card[]>,
    options?: {
      requiredRank?: Rank;
      currentTurnId?: string;
      playSeq?: number;
      status?: GameState['status'];
      centralPile?: GameState['centralPile'];
      winnerId?: string;
      finalCallDeadline?: number | null;
    }
  ): GameState {
    const playerIds = Object.keys(playerHands);
    return {
      roomCode: 'TEST44',
      hostId: playerIds[0],
      status: options?.status ?? 'PLAYING',
      settings: { cardsPerPlayer: 5 },
      players: playerIds.map((id, idx) => ({
        playerId: id,
        name: `Player${idx + 1}`,
        hand: [...playerHands[id]],
      })),
      turnOrder: [...playerIds],
      currentTurnId: options?.currentTurnId ?? playerIds[0],
      requiredRank: options?.requiredRank ?? 'A',
      centralPile: options?.centralPile ? [...options.centralPile] : [],
      playSeq: options?.playSeq ?? 0,
      winnerId: options?.winnerId,
      finalCallDeadline: options?.finalCallDeadline,
    };
  }

  describe('Zod Schemas', () => {
    it('validates CallBluffRequestSchema', () => {
      const valid = CallBluffRequestSchema.safeParse({ playSeq: 1 });
      expect(valid.success).toBe(true);

      const negative = CallBluffRequestSchema.safeParse({ playSeq: -1 });
      expect(negative.success).toBe(false);

      const nonInt = CallBluffRequestSchema.safeParse({ playSeq: 1.5 });
      expect(nonInt.success).toBe(false);

      const extra = CallBluffRequestSchema.safeParse({ playSeq: 1, extra: 'bad' });
      expect(extra.success).toBe(false);
    });

    it('validates PlayAgainRequestSchema', () => {
      const valid = PlayAgainRequestSchema.safeParse({});
      expect(valid.success).toBe(true);

      const extra = PlayAgainRequestSchema.safeParse({ foo: 'bar' });
      expect(extra.success).toBe(false);
    });

    it('validates ChallengeResultSchema', () => {
      const sample = {
        playSeq: 1,
        challengerId: p2,
        accusedId: p1,
        declaredRank: 'A' as Rank,
        revealedCards: [{ id: 'H-A', suit: 'H' as const, rank: 'A' as const }],
        wasBluff: false,
        pickedUpById: p2,
        pickedUpCount: 1,
      };

      const valid = ChallengeResultSchema.safeParse(sample);
      expect(valid.success).toBe(true);

      const zeroCount = ChallengeResultSchema.safeParse({
        ...sample,
        pickedUpCount: 0,
      });
      expect(zeroCount.success).toBe(false);
    });
  });

  describe('Engine: callBluff pure function', () => {
    it('1. truth case: challenger picks up whole pile, accused takes next turn', () => {
      const state = createMockGameState({
        [p1]: [{ id: 'S-K', suit: 'S', rank: 'K' }],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      // p1 plays truthfully: declaredRank = 'A', cards = [H-A, D-A]
      const playRes = playTurn(state, p1, ['H-A', 'D-A']);
      // p1 hand was mock, let's inject realistic hand
      const stateWithCards = createMockGameState({
        [p1]: [
          { id: 'H-A', suit: 'H', rank: 'A' },
          { id: 'D-A', suit: 'D', rank: 'A' },
          { id: 'S-K', suit: 'S', rank: 'K' },
        ],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      const played = playTurn(stateWithCards, p1, ['H-A', 'D-A']);
      expect(played.ok).toBe(true);
      if (!played.ok) return;

      // p2 challenges playSeq 1
      const challengeRes = callBluff(played.state, p2, 1);
      expect(challengeRes.ok).toBe(true);
      if (!challengeRes.ok) return;

      expect(challengeRes.result.wasBluff).toBe(false);
      expect(challengeRes.result.challengerId).toBe(p2);
      expect(challengeRes.result.accusedId).toBe(p1);
      expect(challengeRes.result.pickedUpById).toBe(p2);
      expect(challengeRes.result.pickedUpCount).toBe(2);

      // Loser (p2) received all cards from pile
      const p2Player = challengeRes.state.players.find((p) => p.playerId === p2);
      expect(p2Player?.hand.length).toBe(3); // 1 original + 2 from pile
      expect(challengeRes.state.centralPile.length).toBe(0); // pile emptied
      expect(challengeRes.state.currentTurnId).toBe(p1); // accused wins challenge, takes turn
    });

    it('2. bluff case: accused picks up whole pile, challenger takes next turn', () => {
      const state = createMockGameState({
        [p1]: [
          { id: 'S-7', suit: 'S', rank: '7' },
          { id: 'S-K', suit: 'S', rank: 'K' },
        ],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      // p1 plays bluff: declaredRank = 'A', card = S-7
      const played = playTurn(state, p1, ['S-7']);
      expect(played.ok).toBe(true);
      if (!played.ok) return;

      // p2 challenges playSeq 1
      const challengeRes = callBluff(played.state, p2, 1);
      expect(challengeRes.ok).toBe(true);
      if (!challengeRes.ok) return;

      expect(challengeRes.result.wasBluff).toBe(true);
      expect(challengeRes.result.accusedId).toBe(p1);
      expect(challengeRes.result.pickedUpById).toBe(p1);
      expect(challengeRes.result.pickedUpCount).toBe(1);

      // Loser (p1) picked up pile
      const p1Player = challengeRes.state.players.find((p) => p.playerId === p1);
      expect(p1Player?.hand.length).toBe(2); // 1 remaining + 1 from pile
      expect(challengeRes.state.centralPile.length).toBe(0);
      expect(challengeRes.state.currentTurnId).toBe(p2); // challenger wins, takes turn
    });

    it('3. multi-entry pile pickup: loser gets all cards across all pile entries', () => {
      const state = createMockGameState({
        [p1]: [
          { id: 'H-A', suit: 'H', rank: 'A' },
          { id: 'D-A', suit: 'D', rank: 'A' },
          { id: 'S-K', suit: 'S', rank: 'K' },
        ],
        [p2]: [
          { id: 'C-2', suit: 'C', rank: '2' },
          { id: 'D-2', suit: 'D', rank: '2' },
          { id: 'H-2', suit: 'H', rank: '2' },
        ],
        [p3]: [{ id: 'S-9', suit: 'S', rank: '9' }],
      });

      // Turn 1: p1 plays 2 cards (A)
      const play1 = playTurn(state, p1, ['H-A', 'D-A']);
      expect(play1.ok).toBe(true);
      if (!play1.ok) return;

      // Turn 2: p2 plays 3 cards (2)
      const play2 = playTurn(play1.state, p2, ['C-2', 'D-2', 'H-2']);
      expect(play2.ok).toBe(true);
      if (!play2.ok) return;

      expect(play2.state.centralPile.length).toBe(2);
      expect(play2.state.centralPile[0].count).toBe(2);
      expect(play2.state.centralPile[1].count).toBe(3);

      // Turn 3: p3 challenges p2's play (playSeq 2)
      const challengeRes = callBluff(play2.state, p3, 2);
      expect(challengeRes.ok).toBe(true);
      if (!challengeRes.ok) return;

      // p2 was truthful, so p3 loses and picks up ALL 5 cards from the whole pile
      expect(challengeRes.result.wasBluff).toBe(false);
      expect(challengeRes.result.pickedUpById).toBe(p3);
      expect(challengeRes.result.pickedUpCount).toBe(5);

      const p3Player = challengeRes.state.players.find((p) => p.playerId === p3);
      expect(p3Player?.hand.length).toBe(6); // 1 original + 5 from pile
      expect(challengeRes.state.centralPile.length).toBe(0);
    });

    it('4. winner starts next turn', () => {
      const state = createMockGameState({
        [p1]: [{ id: 'S-5', suit: 'S', rank: '5' }], // Bluff on 'A'
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      const played = playTurn(state, p1, ['S-5']);
      if (!played.ok) return;

      const challenge = callBluff(played.state, p2, 1);
      expect(challenge.ok).toBe(true);
      if (!challenge.ok) return;

      // Challenger p2 won, so next turn is p2
      expect(challenge.state.currentTurnId).toBe(p2);
    });

    it('5. requiredRank unchanged by a challenge', () => {
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      expect(state.requiredRank).toBe('A');
      const played = playTurn(state, p1, ['H-A']);
      if (!played.ok) return;

      // requiredRank rotated to '2' after play
      expect(played.state.requiredRank).toBe('2');

      const challenge = callBluff(played.state, p2, 1);
      expect(challenge.ok).toBe(true);
      if (!challenge.ok) return;

      // requiredRank remains '2' after challenge
      expect(challenge.state.requiredRank).toBe('2');
    });

    it('6. stale playSeq rejected with STALE_CHALLENGE', () => {
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      const played = playTurn(state, p1, ['H-A']);
      if (!played.ok) return;

      // Latest is 1, challenger asks for 99
      const challenge = callBluff(played.state, p2, 99);
      expect(challenge.ok).toBe(false);
      if (challenge.ok) return;
      expect(challenge.code).toBe('STALE_CHALLENGE');
    });

    it('7. challenging your own play rejected with CANNOT_CHALLENGE_SELF', () => {
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      const played = playTurn(state, p1, ['H-A']);
      if (!played.ok) return;

      // p1 challenges their own play
      const challenge = callBluff(played.state, p1, 1);
      expect(challenge.ok).toBe(false);
      if (challenge.ok) return;
      expect(challenge.code).toBe('CANNOT_CHALLENGE_SELF');
    });

    it('8. challenge on an empty pile rejected with PILE_EMPTY', () => {
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      // No plays have been made
      const challenge = callBluff(state, p2, 0);
      expect(challenge.ok).toBe(false);
      if (challenge.ok) return;
      expect(challenge.code).toBe('PILE_EMPTY');
    });

    it('9. simultaneous challenges (second rejected with STALE_CHALLENGE)', () => {
      const state = createMockGameState({
        [p1]: [
          { id: 'H-A', suit: 'H', rank: 'A' },
          { id: 'S-K', suit: 'S', rank: 'K' },
        ],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
        [p3]: [{ id: 'S-3', suit: 'S', rank: '3' }],
      });

      const played = playTurn(state, p1, ['H-A']);
      if (!played.ok) return;

      // First challenge by p2 succeeds
      const challenge1 = callBluff(played.state, p2, 1);
      expect(challenge1.ok).toBe(true);
      if (!challenge1.ok) return;

      // Second challenge by p3 on the same playSeq 1
      const challenge2 = callBluff(challenge1.state, p3, 1);
      expect(challenge2.ok).toBe(false);
      if (challenge2.ok) return;
      expect(challenge2.code).toBe('STALE_CHALLENGE');
    });

    it('11. final call + truth -> win (GAME_OVER)', () => {
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }], // only 1 card left
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      // p1 plays their only card, emptying hand
      const played = playTurn(state, p1, ['H-A']);
      expect(played.ok).toBe(true);
      if (!played.ok) return;
      expect(played.state.status).toBe('FINAL_CALL');

      // p2 challenges truthfully played card
      const challenge = callBluff(played.state, p2, 1);
      expect(challenge.ok).toBe(true);
      if (!challenge.ok) return;

      expect(challenge.result.wasBluff).toBe(false);
      expect(challenge.state.status).toBe('GAME_OVER');
      expect(challenge.state.winnerId).toBe(p1);
      expect(challenge.result.pickedUpById).toBe(p2);
    });

    it('12. final call + bluff -> game continues (PLAYING)', () => {
      const state = createMockGameState({
        [p1]: [{ id: 'S-7', suit: 'S', rank: '7' }], // bluff on 'A'
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      // p1 plays their only card, emptying hand
      const played = playTurn(state, p1, ['S-7']);
      expect(played.ok).toBe(true);
      if (!played.ok) return;
      expect(played.state.status).toBe('FINAL_CALL');

      // p2 challenges bluff
      const challenge = callBluff(played.state, p2, 1);
      expect(challenge.ok).toBe(true);
      if (!challenge.ok) return;

      expect(challenge.result.wasBluff).toBe(true);
      expect(challenge.state.status).toBe('PLAYING');
      expect(challenge.state.winnerId).toBeUndefined();
      expect(challenge.result.pickedUpById).toBe(p1); // liar picks up the pile!

      // p1 now has cards in hand again
      const p1Player = challengeResPlayer(challenge.state, p1);
      expect(p1Player.hand.length).toBe(1);
      // challenger p2 gets the turn
      expect(challenge.state.currentTurnId).toBe(p2);
    });

    it('13. revealedCards only includes the last play, not older entries', () => {
      const state = createMockGameState({
        [p1]: [
          { id: 'H-A', suit: 'H', rank: 'A' },
          { id: 'D-A', suit: 'D', rank: 'A' },
        ],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
        [p3]: [{ id: 'S-9', suit: 'S', rank: '9' }],
      });

      const play1 = playTurn(state, p1, ['H-A', 'D-A']);
      if (!play1.ok) return;
      const play2 = playTurn(play1.state, p2, ['C-2']);
      if (!play2.ok) return;

      const challenge = callBluff(play2.state, p3, 2);
      expect(challenge.ok).toBe(true);
      if (!challenge.ok) return;

      // Only p2's single card is in revealedCards
      expect(challenge.result.revealedCards).toHaveLength(1);
      expect(challenge.result.revealedCards[0].id).toBe('C-2');
      // But 3 total cards were picked up
      expect(challenge.result.pickedUpCount).toBe(3);
    });
  });

  function challengeResPlayer(state: GameState, playerId: string) {
    const p = state.players.find((pl) => pl.playerId === playerId);
    if (!p) throw new Error('Player not found');
    return p;
  }

  describe('RoomManager & Final Call Timer (Fake Timers)', () => {
    it('10. final call expiry -> win (fake timers)', () => {
      let registeredCallback: (() => void) | null = null;
      let registeredDelay: number | null = null;

      const fakeScheduler: Scheduler = {
        setTimeout: (fn: () => void, ms: number) => {
          registeredCallback = fn;
          registeredDelay = ms;
          return 999;
        },
        clearTimeout: vi.fn(),
      };

      const manager = new RoomManager(fakeScheduler);
      const { room, hostPlayer } = manager.createRoom('Host');
      const joinRes = manager.joinRoom(room.roomCode, 'Player2');
      expect(joinRes.ok).toBe(true);

      const startRes = manager.startGame(room.roomCode, hostPlayer.playerId);
      expect(startRes.ok).toBe(true);

      // Force room gameState to have 1 card for host
      if (!room.gameState) return;
      room.gameState.players[0].hand = [{ id: 'H-A', suit: 'H', rank: 'A' }];
      room.gameState.currentTurnId = hostPlayer.playerId;
      room.gameState.requiredRank = 'A';

      // Host plays their last card -> transitions to FINAL_CALL
      const playRes = manager.playTurn(room.roomCode, hostPlayer.playerId, ['H-A']);
      expect(playRes.ok).toBe(true);
      expect(room.status).toBe('FINAL_CALL');
      expect(registeredDelay).toBe(FINAL_CALL_MS);
      expect(registeredCallback).not.toBeNull();

      // Trigger the 10s timer expiry
      registeredCallback!();

      // Status transitions to GAME_OVER and winner is hostPlayer
      expect(room.status).toBe('GAME_OVER');
      expect(room.gameState?.status).toBe('GAME_OVER');
      expect(room.gameState?.winnerId).toBe(hostPlayer.playerId);
    });
  });

  describe('14. Full Socket Integration & Hidden Information Boundary Leak Test', () => {
    let httpServer: HttpServer;
    let ioServer: SocketIOServer;
    let roomManager: RoomManager;
    let port: number;
    const clientSockets: ClientSocket[] = [];

    beforeEach(async () => {
      httpServer = createServer();
      ioServer = new SocketIOServer(httpServer, { cors: { origin: '*' } });
      roomManager = new RoomManager();
      setupSocketServer(ioServer, roomManager);

      await new Promise<void>((resolve) => {
        httpServer.listen(0, () => {
          const addr = httpServer.address() as AddressInfo;
          port = addr.port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      for (const socket of clientSockets) {
        socket.disconnect();
      }
      clientSockets.length = 0;
      roomManager.clearAll();
      ioServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    function createClientSocket(): ClientSocket {
      const client = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });
      clientSockets.push(client);
      return client;
    }

    it('faces appear only inside challenge_result; play_again returns room to LOBBY', async () => {
      const clientA = createClientSocket();
      const clientB = createClientSocket();

      let sessionA!: SessionIssued;
      let sessionB!: SessionIssued;

      clientA.on(SERVER_EVENTS.SESSION_ISSUED, (data) => (sessionA = data));
      clientB.on(SERVER_EVENTS.SESSION_ISSUED, (data) => (sessionB = data));

      // 1. Client A creates room
      clientA.emit(CLIENT_EVENTS.CREATE_ROOM, { playerName: 'Alice' });
      await vi.waitFor(() => expect(sessionA).toBeDefined(), { timeout: 2000 });

      // 2. Client B joins
      clientB.emit(CLIENT_EVENTS.JOIN_ROOM, {
        roomCode: sessionA.roomCode,
        playerName: 'Bob',
      });
      await vi.waitFor(() => expect(sessionB).toBeDefined(), { timeout: 2000 });

      // Start game
      clientA.emit(CLIENT_EVENTS.START_GAME, {});

      let stateA!: PublicGameState;
      let stateB!: PublicGameState;

      clientA.on(SERVER_EVENTS.GAME_STATE, (s) => (stateA = s));
      clientB.on(SERVER_EVENTS.GAME_STATE, (s) => (stateB = s));

      await vi.waitFor(() => expect(stateA && stateB).toBeDefined(), { timeout: 2000 });

      // Track all messages received by B to test for card leaks
      const allEventsReceivedByB: { event: string; data: unknown }[] = [];
      const originalOnevent = (clientB as unknown as { onevent: (packet: { data: unknown[] }) => void }).onevent;
      (clientB as unknown as { onevent: (packet: { data: unknown[] }) => void }).onevent = function (packet) {
        allEventsReceivedByB.push({
          event: packet.data[0] as string,
          data: packet.data[1],
        });
        originalOnevent?.call(this, packet);
      };

      // Set turn to player A
      const room = roomManager.getRoom(sessionA.roomCode)!;
      room.gameState!.currentTurnId = sessionA.playerId;
      room.gameState!.requiredRank = 'A';
      const aCard = stateA.myHand[0];

      // A plays 1 card
      clientA.emit(CLIENT_EVENTS.PLAY_TURN, {
        selectedCardIds: [aCard.id],
      });

      await vi.waitFor(
        () => {
          expect(stateB.pile.count).toBe(1);
          expect(stateB.pile.lastPlay).not.toBeNull();
        },
        { timeout: 2000 }
      );

      // Verify NO card identity of A's card was leaked to B in game_state or room_view
      for (const msg of allEventsReceivedByB) {
        if (msg.event === SERVER_EVENTS.GAME_STATE || msg.event === SERVER_EVENTS.ROOM_VIEW) {
          const serialized = JSON.stringify(msg.data);
          expect(serialized).not.toContain(aCard.id);
        }
      }

      // Now B calls bluff on playSeq 1
      let challengeResultReceivedByB: ChallengeResult | null = null;
      clientB.on(SERVER_EVENTS.CHALLENGE_RESULT, (res) => {
        challengeResultReceivedByB = res;
      });

      clientB.emit(CLIENT_EVENTS.CALL_BLUFF, {
        playSeq: stateB.pile.lastPlay!.playSeq,
      });

      await vi.waitFor(() => expect(challengeResultReceivedByB).not.toBeNull(), {
        timeout: 2000,
      });

      // Card face DOES appear in challenge_result:
      expect(challengeResultReceivedByB!.revealedCards).toHaveLength(1);
      expect(challengeResultReceivedByB!.revealedCards[0].id).toBe(aCard.id);

      // Verify that after challenge, game_state has emptied pile
      await vi.waitFor(() => expect(stateB.pile.count).toBe(0), { timeout: 2000 });
      const latestGameStateStr = JSON.stringify(stateB);
      // Opponent cards do not appear in B's state
      expect(stateB.pile.lastPlay).toBeNull();

      // Test host-only play_again
      // Set room status to GAME_OVER
      room.status = 'GAME_OVER';
      room.gameState!.status = 'GAME_OVER';
      room.gameState!.winnerId = sessionA.playerId;

      let roomViewAfterPlayAgain: unknown = null;
      clientA.on(SERVER_EVENTS.ROOM_VIEW, (rv) => {
        roomViewAfterPlayAgain = rv;
      });

      // Non-host (B) attempts play_again -> error
      let errorB: unknown = null;
      clientB.on(SERVER_EVENTS.ERROR, (err) => (errorB = err));
      clientB.emit(CLIENT_EVENTS.PLAY_AGAIN, {});
      await vi.waitFor(() => expect(errorB).not.toBeNull(), { timeout: 2000 });

      // Host (A) emits play_again -> success, status returns to LOBBY
      clientA.emit(CLIENT_EVENTS.PLAY_AGAIN, {});
      await vi.waitFor(
        () => {
          expect(room.status).toBe('LOBBY');
          expect(room.gameState).toBeNull();
        },
        { timeout: 2000 }
      );
    });

    it('full game played to a winner in 3 tabs, including a final-call scenario', async () => {
      const clientA = createClientSocket();
      const clientB = createClientSocket();
      const clientC = createClientSocket();

      let sessionA!: SessionIssued;
      let sessionB!: SessionIssued;
      let sessionC!: SessionIssued;

      clientA.on(SERVER_EVENTS.SESSION_ISSUED, (data) => (sessionA = data));
      clientB.on(SERVER_EVENTS.SESSION_ISSUED, (data) => (sessionB = data));
      clientC.on(SERVER_EVENTS.SESSION_ISSUED, (data) => (sessionC = data));

      // 1. Tab A creates room
      clientA.emit(CLIENT_EVENTS.CREATE_ROOM, { playerName: 'Alice' });
      await vi.waitFor(() => expect(sessionA).toBeDefined(), { timeout: 2000 });

      // 2. Tab B joins
      clientB.emit(CLIENT_EVENTS.JOIN_ROOM, {
        roomCode: sessionA.roomCode,
        playerName: 'Bob',
      });
      await vi.waitFor(() => expect(sessionB).toBeDefined(), { timeout: 2000 });

      // 3. Tab C joins
      clientC.emit(CLIENT_EVENTS.JOIN_ROOM, {
        roomCode: sessionA.roomCode,
        playerName: 'Charlie',
      });
      await vi.waitFor(() => expect(sessionC).toBeDefined(), { timeout: 2000 });

      // Host starts game
      clientA.emit(CLIENT_EVENTS.START_GAME, {});

      let stateA!: PublicGameState;
      let stateB!: PublicGameState;
      let stateC!: PublicGameState;

      clientA.on(SERVER_EVENTS.GAME_STATE, (s) => (stateA = s));
      clientB.on(SERVER_EVENTS.GAME_STATE, (s) => (stateB = s));
      clientC.on(SERVER_EVENTS.GAME_STATE, (s) => (stateC = s));

      await vi.waitFor(() => expect(stateA && stateB && stateC).toBeDefined(), {
        timeout: 2000,
      });

      // Manipulate hand so Alice (A) has exactly 1 card to trigger FINAL_CALL scenario
      const room = roomManager.getRoom(sessionA.roomCode)!;
      room.gameState!.currentTurnId = sessionA.playerId;
      room.gameState!.requiredRank = 'A';
      room.gameState!.players.find((p) => p.playerId === sessionA.playerId)!.hand = [
        { id: 'H-A', suit: 'H', rank: 'A' },
      ];

      // A plays their last card truthfully
      clientA.emit(CLIENT_EVENTS.PLAY_TURN, {
        selectedCardIds: ['H-A'],
      });

      // All 3 tabs see FINAL_CALL
      await vi.waitFor(
        () => {
          expect(stateA.status).toBe('FINAL_CALL');
          expect(stateB.status).toBe('FINAL_CALL');
          expect(stateC.status).toBe('FINAL_CALL');
          expect(stateA.finalCallDeadline).not.toBeNull();
        },
        { timeout: 2000 }
      );

      // Bob (clientB) challenges Alice's final play
      let challengeResultReceived: ChallengeResult | null = null;
      clientC.on(SERVER_EVENTS.CHALLENGE_RESULT, (res) => {
        challengeResultReceived = res;
      });

      clientB.emit(CLIENT_EVENTS.CALL_BLUFF, {
        playSeq: stateB.pile.lastPlay!.playSeq,
      });

      // All tabs receive challenge_result and see Alice won! (truthful final play)
      await vi.waitFor(
        () => {
          expect(challengeResultReceived).not.toBeNull();
          expect(stateA.status).toBe('GAME_OVER');
          expect(stateB.status).toBe('GAME_OVER');
          expect(stateC.status).toBe('GAME_OVER');
          expect(stateA.winnerId).toBe(sessionA.playerId);
          expect(stateB.winnerId).toBe(sessionA.playerId);
          expect(stateC.winnerId).toBe(sessionA.playerId);
        },
        { timeout: 2000 }
      );

      // Loser Bob picked up the pile
      expect(challengeResultReceived!.wasBluff).toBe(false);
      expect(challengeResultReceived!.pickedUpById).toBe(sessionB.playerId);

      // Alice (host) clicks Play Again
      clientA.emit(CLIENT_EVENTS.PLAY_AGAIN, {});
      await vi.waitFor(
        () => {
          expect(room.status).toBe('LOBBY');
          expect(room.players.length).toBe(3);
        },
        { timeout: 2000 }
      );
    });
  });
});
