import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  PlayTurnRequestSchema,
  GameState,
  PublicGameState,
  SessionIssued,
  Rank,
  Card,
} from '@bluff/shared';
import { playTurn, startGame } from '../engine/game.js';
import { RoomManager } from '../room-manager.js';
import { setupSocketServer } from '../socket/index.js';

describe('Slice 3: Play Loop Engine & Schema', () => {
  describe('PlayTurnRequestSchema validation', () => {
    it('accepts 1 to 4 unique card IDs', () => {
      const single = PlayTurnRequestSchema.safeParse({ selectedCardIds: ['H-A'] });
      expect(single.success).toBe(true);

      const four = PlayTurnRequestSchema.safeParse({
        selectedCardIds: ['H-A', 'D-2', 'C-3', 'S-4'],
      });
      expect(four.success).toBe(true);
    });

    it('rejects 0 cards and 5 cards', () => {
      const zero = PlayTurnRequestSchema.safeParse({ selectedCardIds: [] });
      expect(zero.success).toBe(false);

      const five = PlayTurnRequestSchema.safeParse({
        selectedCardIds: ['H-A', 'D-2', 'C-3', 'S-4', 'H-5'],
      });
      expect(five.success).toBe(false);
    });

    it('rejects duplicate card IDs', () => {
      const dup = PlayTurnRequestSchema.safeParse({
        selectedCardIds: ['H-A', 'H-A'],
      });
      expect(dup.success).toBe(false);
      if (!dup.success) {
        expect(dup.error.issues[0].message).toContain('unique');
      }
    });

    it('strict schema rejects declaredRank and unknown keys', () => {
      const withDeclaredRank = PlayTurnRequestSchema.safeParse({
        selectedCardIds: ['H-A'],
        declaredRank: 'A',
      });
      expect(withDeclaredRank.success).toBe(false);

      const withUnknownKey = PlayTurnRequestSchema.safeParse({
        selectedCardIds: ['H-A'],
        extra: 'field',
      });
      expect(withUnknownKey.success).toBe(false);
    });
  });

  describe('Engine playTurn pure function', () => {
    function createMockGameState(
      playerHands: Record<string, Card[]>,
      options?: {
        requiredRank?: Rank;
        currentTurnId?: string;
        playSeq?: number;
        status?: GameState['status'];
      }
    ): GameState {
      const playerIds = Object.keys(playerHands);
      return {
        roomCode: 'TEST12',
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
        centralPile: [],
        playSeq: options?.playSeq ?? 0,
      };
    }

    it('valid play updates hand, pile, playSeq, turn, and rank', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const p3 = '33333333-3333-3333-3333-333333333333';

      const state = createMockGameState({
        [p1]: [
          { id: 'H-A', suit: 'H', rank: 'A' },
          { id: 'D-A', suit: 'D', rank: 'A' },
          { id: 'S-7', suit: 'S', rank: '7' },
        ],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
        [p3]: [{ id: 'C-3', suit: 'C', rank: '3' }],
      });

      const result = playTurn(state, p1, ['H-A', 'D-A']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const next = result.state;
      // Hand updated
      const p1Updated = next.players.find((p) => p.playerId === p1)!;
      expect(p1Updated.hand).toEqual([{ id: 'S-7', suit: 'S', rank: '7' }]);

      // Pile updated
      expect(next.centralPile).toHaveLength(1);
      expect(next.centralPile[0]).toEqual({
        playSeq: 1,
        playerId: p1,
        cards: [
          { id: 'H-A', suit: 'H', rank: 'A' },
          { id: 'D-A', suit: 'D', rank: 'A' },
        ],
        declaredRank: 'A',
        count: 2,
      });

      // playSeq updated
      expect(next.playSeq).toBe(1);

      // turn updated to next in turnOrder (p2)
      expect(next.currentTurnId).toBe(p2);

      // requiredRank advanced from A to 2
      expect(next.requiredRank).toBe('2');

      // status remains PLAYING
      expect(next.status).toBe('PLAYING');
    });

    it('rejects play on wrong turn', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      const result = playTurn(state, p2, ['C-2']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_YOUR_TURN');
      }
    });

    it('rejects card not in hand', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      const result = playTurn(state, p1, ['S-K']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('CARD_NOT_IN_HAND');
      }
    });

    it('rejects duplicate card ids', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      const result = playTurn(state, p1, ['H-A', 'H-A']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('DUPLICATE_CARDS');
      }
    });

    it('rejects 0 and 5 cards', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const state = createMockGameState({
        [p1]: [
          { id: 'H-1', suit: 'H', rank: 'A' },
          { id: 'H-2', suit: 'H', rank: '2' },
          { id: 'H-3', suit: 'H', rank: '3' },
          { id: 'H-4', suit: 'H', rank: '4' },
          { id: 'H-5', suit: 'H', rank: '5' },
        ],
        [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
      });

      const zeroResult = playTurn(state, p1, []);
      expect(zeroResult.ok).toBe(false);
      if (!zeroResult.ok) expect(zeroResult.code).toBe('INVALID_CARD_COUNT');

      const fiveResult = playTurn(state, p1, ['H-1', 'H-2', 'H-3', 'H-4', 'H-5']);
      expect(fiveResult.ok).toBe(false);
      if (!fiveResult.ok) expect(fiveResult.code).toBe('INVALID_CARD_COUNT');
    });

    it('wraps rank from K to A', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const state = createMockGameState(
        {
          [p1]: [
            { id: 'H-K', suit: 'H', rank: 'K' },
            { id: 'D-2', suit: 'D', rank: '2' },
          ],
          [p2]: [{ id: 'C-2', suit: 'C', rank: '2' }],
        },
        { requiredRank: 'K' }
      );

      const result = playTurn(state, p1, ['H-K']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.state.requiredRank).toBe('A');
    });

    it('wraps turn order when last player plays', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const p3 = '33333333-3333-3333-3333-333333333333';
      const state = createMockGameState(
        {
          [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
          [p2]: [{ id: 'D-2', suit: 'D', rank: '2' }],
          [p3]: [
            { id: 'C-3', suit: 'C', rank: '3' },
            { id: 'C-4', suit: 'C', rank: '4' },
          ],
        },
        { currentTurnId: p3 }
      );

      const result = playTurn(state, p3, ['C-3']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Wraps around from p3 to p1
      expect(result.state.currentTurnId).toBe(p1);
    });

    it('emptying the hand sets FINAL_CALL and records winnerId', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const state = createMockGameState({
        [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
        [p2]: [{ id: 'D-2', suit: 'D', rank: '2' }],
      });

      const result = playTurn(state, p1, ['H-A']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.state.status).toBe('FINAL_CALL');
      expect(result.state.winnerId).toBe(p1);
      const p1Player = result.state.players.find((p) => p.playerId === p1)!;
      expect(p1Player.hand).toHaveLength(0);
    });

    it('rejects play if status is not PLAYING', () => {
      const p1 = '11111111-1111-1111-1111-111111111111';
      const p2 = '22222222-2222-2222-2222-222222222222';
      const state = createMockGameState(
        {
          [p1]: [{ id: 'H-A', suit: 'H', rank: 'A' }],
          [p2]: [{ id: 'D-2', suit: 'D', rank: '2' }],
        },
        { status: 'FINAL_CALL' }
      );

      const result = playTurn(state, p1, ['H-A']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('GAME_NOT_PLAYING');
      }
    });
  });
});

describe('Slice 3: Socket Integration & Privacy Wire Checks', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let roomManager: RoomManager;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    ioServer = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
    });
    roomManager = new RoomManager();
    setupSocketServer(ioServer, roomManager);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    ioServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    roomManager.clearAll();
  });

  function createClient(sessionToken?: string): ClientSocket {
    return ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: sessionToken ? { sessionToken } : {},
    });
  }

  it('3 tabs play rounds in turn, rotates rank, rejects illegal plays, and leaks no card identities', async () => {
    const c1 = createClient();
    const c2 = createClient();
    const c3 = createClient();

    let s1: SessionIssued | null = null;
    let s2: SessionIssued | null = null;
    let s3: SessionIssued | null = null;

    // 1. C1 creates room
    await new Promise<void>((resolve) => {
      c1.on(SERVER_EVENTS.SESSION_ISSUED, (data) => {
        s1 = data;
        resolve();
      });
      c1.emit(CLIENT_EVENTS.CREATE_ROOM, { playerName: 'Alice' });
    });
    const roomCode = s1!.roomCode;

    // 2. C2 & C3 join
    await new Promise<void>((resolve) => {
      c2.on(SERVER_EVENTS.SESSION_ISSUED, (data) => {
        s2 = data;
        resolve();
      });
      c2.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode, playerName: 'Bob' });
    });

    await new Promise<void>((resolve) => {
      c3.on(SERVER_EVENTS.SESSION_ISSUED, (data) => {
        s3 = data;
        resolve();
      });
      c3.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode, playerName: 'Charlie' });
    });

    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(s3).not.toBeNull();

    // 3. Start game
    let p1State: PublicGameState | null = null;
    let p2State: PublicGameState | null = null;
    let p3State: PublicGameState | null = null;

    c1.on(SERVER_EVENTS.GAME_STATE, (state: PublicGameState) => {
      p1State = state;
    });
    c2.on(SERVER_EVENTS.GAME_STATE, (state: PublicGameState) => {
      p2State = state;
    });
    c3.on(SERVER_EVENTS.GAME_STATE, (state: PublicGameState) => {
      p3State = state;
    });

    await new Promise<void>((resolve) => {
      let count = 0;
      const check = () => {
        count++;
        if (count >= 3) resolve();
      };
      c1.once(SERVER_EVENTS.GAME_STATE, check);
      c2.once(SERVER_EVENTS.GAME_STATE, check);
      c3.once(SERVER_EVENTS.GAME_STATE, check);
      c1.emit(CLIENT_EVENTS.START_GAME, {});
    });

    expect(p1State).not.toBeNull();
    expect(p2State).not.toBeNull();
    expect(p3State).not.toBeNull();

    // Verify initial rank is A
    expect(p1State!.requiredRank).toBe('A');

    // 4. Illegal play attempt 1: Player with wrong turn tries to play
    const currentTurnId = p1State!.currentTurnId;
    const nonTurnClient =
      currentTurnId === s1!.playerId
        ? c2
        : currentTurnId === s2!.playerId
          ? c1
          : c1;
    const nonTurnSession =
      currentTurnId === s1!.playerId
        ? s2!
        : currentTurnId === s2!.playerId
          ? s1!
          : s1!;
    const nonTurnState =
      currentTurnId === s1!.playerId
        ? p2State!
        : currentTurnId === s2!.playerId
          ? p1State!
          : p1State!;

    await new Promise<void>((resolve) => {
      nonTurnClient.once(SERVER_EVENTS.ERROR, (err: { code: string }) => {
        expect(err.code).toBe('NOT_YOUR_TURN');
        resolve();
      });
      nonTurnClient.emit(CLIENT_EVENTS.PLAY_TURN, {
        selectedCardIds: [nonTurnState.myHand[0].id],
      });
    });

    // 5. Illegal play attempt 2: Client sending declaredRank (strict schema violation)
    const activeClient =
      currentTurnId === s1!.playerId
        ? c1
        : currentTurnId === s2!.playerId
          ? c2
          : c3;
    const activeState =
      currentTurnId === s1!.playerId
        ? p1State!
        : currentTurnId === s2!.playerId
          ? p2State!
          : p3State!;

    await new Promise<void>((resolve) => {
      activeClient.once(SERVER_EVENTS.ERROR, (err: { code: string; message: string }) => {
        expect(err.code).toBe('INVALID_PAYLOAD');
        resolve();
      });
      activeClient.emit(CLIENT_EVENTS.PLAY_TURN, {
        selectedCardIds: [activeState.myHand[0].id],
        declaredRank: 'A',
      });
    });

    // 6. Valid play by active player
    const cardToPlay = activeState.myHand[0].id;
    await new Promise<void>((resolve) => {
      let count = 0;
      const check = () => {
        count++;
        if (count >= 3) resolve();
      };
      c1.once(SERVER_EVENTS.GAME_STATE, check);
      c2.once(SERVER_EVENTS.GAME_STATE, check);
      c3.once(SERVER_EVENTS.GAME_STATE, check);

      activeClient.emit(CLIENT_EVENTS.PLAY_TURN, {
        selectedCardIds: [cardToPlay],
      });
    });

    // Verify after play: requiredRank rotated to '2', pile count is 1
    expect(p1State!.requiredRank).toBe('2');
    expect(p2State!.requiredRank).toBe('2');
    expect(p3State!.requiredRank).toBe('2');

    expect(p1State!.pile.count).toBe(1);
    expect(p1State!.pile.lastPlay).toEqual({
      playSeq: 1,
      playerId: currentTurnId,
      declaredRank: 'A',
      count: 1,
    });

    // 7. Verify Privacy Wire Boundary / Leak Test
    // Inspect all 3 clients' game state representations
    for (const clientState of [p1State!, p2State!, p3State!]) {
      // Pile must only contain count & lastPlay summary; NO card faces or IDs
      expect(clientState.pile).not.toHaveProperty('cards');
      expect((clientState.pile as any).cards).toBeUndefined();

      // Hand identities of opponents must NOT be present
      for (const playerView of clientState.players) {
        expect(playerView).toHaveProperty('handCount');
        expect(playerView).not.toHaveProperty('hand');
        expect((playerView as any).hand).toBeUndefined();
      }

      // No session tokens in public game state
      const serialized = JSON.stringify(clientState);
      expect(serialized).not.toContain(s1!.sessionToken);
      expect(serialized).not.toContain(s2!.sessionToken);
      expect(serialized).not.toContain(s3!.sessionToken);
    }
  });
});
