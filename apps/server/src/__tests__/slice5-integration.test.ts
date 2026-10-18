import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  PublicGameState,
  RoomView,
  SessionIssued,
  ChallengeResult,
  ErrorEvent,
  REJOIN_GRACE_MS,
  PlayerDisconnected,
  PlayerReconnected,
  Card,
} from '@bluff/shared';
import { RoomManager, Scheduler } from '../room-manager.js';
import { setupSocketServer } from '../socket/index.js';

class ControllableScheduler implements Scheduler {
  public tasks = new Map<number, { cb: () => void; ms: number }>();
  private nextId = 1;

  setTimeout(cb: () => void, ms: number): number {
    const id = this.nextId++;
    this.tasks.set(id, { cb, ms });
    return id;
  }

  clearTimeout(id: unknown): void {
    if (typeof id === 'number') {
      this.tasks.delete(id);
    }
  }

  trigger(predicate?: (t: { ms: number }) => boolean): boolean {
    for (const [id, task] of this.tasks.entries()) {
      if (!predicate || predicate(task)) {
        this.tasks.delete(id);
        task.cb();
        return true;
      }
    }
    return false;
  }
}

describe('Slice 5: End-to-End Multi-Client Integration Test (3 clients)', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let scheduler: ControllableScheduler;
  let roomManager: RoomManager;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  beforeEach(async () => {
    httpServer = createServer();
    ioServer = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
      maxHttpBufferSize: 10 * 1024,
    });
    scheduler = new ControllableScheduler();
    roomManager = new RoomManager(scheduler);
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
      if (socket.connected) {
        socket.disconnect();
      }
    }
    clientSockets.length = 0;
    roomManager.clearAll();
    ioServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function createClientSocket(sessionToken?: string): ClientSocket {
    const client = ioc(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: sessionToken ? { sessionToken } : undefined,
    });
    clientSockets.push(client);
    return client;
  }

  it('full integration: 3 clients, settings update, plays, bluff & truth challenges, pause/resume, preserved final-call, abandon & play_again with zero card leaks', async () => {
    const clientA = createClientSocket();
    const clientB = createClientSocket();
    let clientC = createClientSocket();

    let sessionA!: SessionIssued;
    let sessionB!: SessionIssued;
    let sessionC!: SessionIssued;

    clientA.on(SERVER_EVENTS.SESSION_ISSUED, (d) => (sessionA = d));
    clientB.on(SERVER_EVENTS.SESSION_ISSUED, (d) => (sessionB = d));
    clientC.on(SERVER_EVENTS.SESSION_ISSUED, (d) => (sessionC = d));

    // Record EVERY frame received by Client A to verify hidden information boundary
    const clientAFrames: Array<{ event: string; data: unknown }> = [];
    const originalOneventA = (clientA as unknown as { onevent: (packet: { data: unknown[] }) => void }).onevent;
    (clientA as unknown as { onevent: (packet: { data: unknown[] }) => void }).onevent = function (packet) {
      clientAFrames.push({
        event: packet.data[0] as string,
        data: packet.data[1],
      });
      originalOneventA?.call(this, packet);
    };

    // 1. Client A creates room
    clientA.emit(CLIENT_EVENTS.CREATE_ROOM, { playerName: 'Alice' });
    await vi.waitFor(() => expect(sessionA).toBeDefined(), { timeout: 2000 });
    const roomCode = sessionA.roomCode;

    // 2. Client B joins
    clientB.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode, playerName: 'Bob' });
    await vi.waitFor(() => expect(sessionB).toBeDefined(), { timeout: 2000 });

    // 3. Client C joins
    clientC.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode, playerName: 'Charlie' });
    await vi.waitFor(() => expect(sessionC).toBeDefined(), { timeout: 2000 });

    // 4. Host sets cardsPerPlayer to 3
    let roomViewA!: RoomView;
    clientA.on(SERVER_EVENTS.ROOM_VIEW, (rv) => (roomViewA = rv));

    clientA.emit(CLIENT_EVENTS.UPDATE_SETTINGS, { cardsPerPlayer: 3 });
    await vi.waitFor(() => expect(roomViewA?.settings?.cardsPerPlayer).toBe(3), { timeout: 2000 });

    // 5. Host starts game
    let stateA!: PublicGameState;
    let stateB!: PublicGameState;
    let stateC!: PublicGameState;

    clientA.on(SERVER_EVENTS.GAME_STATE, (s) => (stateA = s));
    clientB.on(SERVER_EVENTS.GAME_STATE, (s) => (stateB = s));
    clientC.on(SERVER_EVENTS.GAME_STATE, (s) => (stateC = s));

    clientA.emit(CLIENT_EVENTS.START_GAME, {});
    await vi.waitFor(
      () => {
        expect(stateA?.status).toBe('PLAYING');
        expect(stateB?.status).toBe('PLAYING');
        expect(stateC?.status).toBe('PLAYING');
      },
      { timeout: 2000 }
    );

    expect(stateA.myHand).toHaveLength(3);
    expect(stateB.myHand).toHaveLength(3);
    expect(stateC.myHand).toHaveLength(3);

    // Track all opponent card IDs that ever exist
    const room = roomManager.getRoom(roomCode)!;
    const opponentCardIds = new Set<string>();
    const bPlayer = room.gameState!.players.find((p) => p.playerId === sessionB.playerId)!;
    const cPlayer = room.gameState!.players.find((p) => p.playerId === sessionC.playerId)!;
    bPlayer.hand.forEach((c: Card) => opponentCardIds.add(c.id));
    cPlayer.hand.forEach((c: Card) => opponentCardIds.add(c.id));

    // Helper map of socket by playerId
    const clientByPlayerId = new Map<string, ClientSocket>([
      [sessionA.playerId, clientA],
      [sessionB.playerId, clientB],
      [sessionC.playerId, clientC],
    ]);

    // Ensure turn order starts with Alice (sessionA.playerId)
    room.gameState!.turnOrder = [sessionA.playerId, sessionB.playerId, sessionC.playerId];
    room.gameState!.currentTurnId = sessionA.playerId;
    room.gameState!.requiredRank = 'A';

    // 6. Truthful challenge:
    // Alice plays a card matching required rank 'A'
    const aliceCard = stateA.myHand[0];
    aliceCard.rank = 'A';
    const alicePlayer = room.gameState!.players.find((p) => p.playerId === sessionA.playerId)!;
    alicePlayer.hand[0].rank = 'A';

    clientA.emit(CLIENT_EVENTS.PLAY_TURN, { selectedCardIds: [aliceCard.id] });
    await vi.waitFor(() => expect(stateA.pile.count).toBe(1), { timeout: 2000 });
    expect(stateA.pile.lastPlay?.declaredRank).toBe('A');

    // Bob challenges Alice (who played truth)
    let truthChallengeResult!: ChallengeResult;
    clientA.on(SERVER_EVENTS.CHALLENGE_RESULT, (cr) => (truthChallengeResult = cr));

    clientB.emit(CLIENT_EVENTS.CALL_BLUFF, {
      playSeq: stateA.pile.lastPlay!.playSeq,
    });

    await vi.waitFor(() => expect(truthChallengeResult).toBeDefined(), { timeout: 2000 });
    expect(truthChallengeResult.wasBluff).toBe(false);
    expect(truthChallengeResult.accusedId).toBe(sessionA.playerId);
    expect(truthChallengeResult.challengerId).toBe(sessionB.playerId);
    expect(truthChallengeResult.pickedUpById).toBe(sessionB.playerId);
    expect(truthChallengeResult.revealedCards).toHaveLength(1);
    expect(truthChallengeResult.revealedCards[0].id).toBe(aliceCard.id);
    await vi.waitFor(() => expect(stateA.pile.count).toBe(0), { timeout: 2000 });

    // 7. Bluff-caught challenge:
    // Turn returned to Alice (winner of challenge). Alice plays 1 card.
    const aliceCard2 = stateA.myHand[0];
    aliceCard2.rank = stateA.requiredRank;
    alicePlayer.hand[0].rank = stateA.requiredRank;

    clientA.emit(CLIENT_EVENTS.PLAY_TURN, { selectedCardIds: [aliceCard2.id] });
    await vi.waitFor(() => expect(stateA.pile.count).toBe(1), { timeout: 2000 });

    // Turn moves to Bob. Bob plays a bluff card (forced to 'K' when required rank is not 'K')
    const bobPlayer = room.gameState!.players.find((p) => p.playerId === sessionB.playerId)!;
    bobPlayer.hand[0].rank = 'K';
    const bluffCard = bobPlayer.hand[0];

    clientB.emit(CLIENT_EVENTS.PLAY_TURN, { selectedCardIds: [bluffCard.id] });
    await vi.waitFor(() => expect(stateA.pile.count).toBe(2), { timeout: 2000 });

    // Turn moves to Charlie. Charlie calls bluff on Bob.
    let bluffChallengeResult!: ChallengeResult;
    clientA.on(SERVER_EVENTS.CHALLENGE_RESULT, (cr) => (bluffChallengeResult = cr));

    clientC.emit(CLIENT_EVENTS.CALL_BLUFF, {
      playSeq: stateA.pile.lastPlay!.playSeq,
    });

    await vi.waitFor(() => expect(bluffChallengeResult).toBeDefined(), { timeout: 2000 });
    expect(bluffChallengeResult.wasBluff).toBe(true);
    expect(bluffChallengeResult.accusedId).toBe(sessionB.playerId);
    expect(bluffChallengeResult.pickedUpById).toBe(sessionB.playerId);
    expect(bluffChallengeResult.challengerId).toBe(sessionC.playerId);
    expect(bluffChallengeResult.revealedCards).toHaveLength(1);
    expect(bluffChallengeResult.revealedCards[0].id).toBe(bluffCard.id);
    expect(bluffChallengeResult.revealedCards[0].rank).toBe('K');
    await vi.waitFor(() => expect(stateA.pile.count).toBe(0), { timeout: 2000 });

    // 8. Charlie plays 1 card to continue gameplay
    const charliePlayer = room.gameState!.players.find((p) => p.playerId === sessionC.playerId)!;
    const charlieCard = charliePlayer.hand[0];
    charliePlayer.hand[0].rank = stateA.requiredRank;

    clientC.emit(CLIENT_EVENTS.PLAY_TURN, { selectedCardIds: [charlieCard.id] });
    await vi.waitFor(() => expect(stateA.pile.count).toBe(1), { timeout: 2000 });

    // 9. Disconnect one client during PLAYING -> PAUSED -> rejoin -> resumes
    let disconnectedNoticeA!: PlayerDisconnected;
    clientA.on(SERVER_EVENTS.PLAYER_DISCONNECTED, (d) => (disconnectedNoticeA = d));

    clientC.disconnect();
    await vi.waitFor(() => expect(stateA.status).toBe('PAUSED'), { timeout: 2000 });
    expect(stateA.pausedFrom).toBe('PLAYING');
    expect(disconnectedNoticeA?.playerId).toBe(sessionC.playerId);
    expect(stateA.rejoinDeadline).toBeDefined();

    // Verify while PAUSED, play_turn and call_bluff are rejected with GAME_PAUSED
    let errorA!: ErrorEvent;
    clientA.on(SERVER_EVENTS.ERROR, (e) => (errorA = e));
    clientA.emit(CLIENT_EVENTS.PLAY_TURN, { selectedCardIds: [stateA.myHand[0].id] });
    await vi.waitFor(() => expect(errorA?.code).toBe('GAME_PAUSED'), { timeout: 2000 });

    // Reconnect Charlie with valid sessionToken
    let reconnectedNoticeA!: PlayerReconnected;
    clientA.on(SERVER_EVENTS.PLAYER_RECONNECTED, (r) => (reconnectedNoticeA = r));

    clientC = createClientSocket(sessionC.sessionToken);
    clientByPlayerId.set(sessionC.playerId, clientC);
    clientC.on(SERVER_EVENTS.GAME_STATE, (s) => (stateC = s));

    await vi.waitFor(() => expect(stateA.status).toBe('PLAYING'), { timeout: 2000 });
    expect(reconnectedNoticeA?.playerId).toBe(sessionC.playerId);
    await vi.waitFor(() => expect(stateC?.status).toBe('PLAYING'), { timeout: 2000 });

    // 10. Disconnect during FINAL_CALL -> remaining time preserved on resume
    // Transition game into FINAL_CALL
    room.gameState!.status = 'FINAL_CALL';
    room.status = 'FINAL_CALL';
    const initialDeadline = Date.now() + 8000;
    room.gameState!.finalCallDeadline = initialDeadline;
    roomManager.scheduleFinalCallTimer(roomCode, 8000);

    // Disconnect Bob during FINAL_CALL
    clientB.disconnect();
    await vi.waitFor(() => expect(stateA.status).toBe('PAUSED'), { timeout: 2000 });
    expect(stateA.pausedFrom).toBe('FINAL_CALL');
    expect(stateA.finalCallRemainingMs).toBeGreaterThan(0);
    expect(stateA.finalCallRemainingMs).toBeLessThanOrEqual(8000);
    const savedRemainingMs = stateA.finalCallRemainingMs!;

    // Reconnect Bob with sessionToken
    const newClientB = createClientSocket(sessionB.sessionToken);
    newClientB.on(SERVER_EVENTS.GAME_STATE, (s) => (stateB = s));

    await vi.waitFor(() => expect(stateA.status).toBe('FINAL_CALL'), { timeout: 2000 });
    // Verify remaining time was preserved (not reset to 10s)
    const expectedDeadlineMin = Date.now() + savedRemainingMs - 200;
    const expectedDeadlineMax = Date.now() + savedRemainingMs + 200;
    expect(stateA.finalCallDeadline).toBeGreaterThanOrEqual(expectedDeadlineMin);
    expect(stateA.finalCallDeadline).toBeLessThanOrEqual(expectedDeadlineMax);

    // 11. Grace expiry -> PLAYER_ABANDONED
    // Disconnect Charlie and let grace timer expire
    clientC.disconnect();
    await vi.waitFor(() => expect(stateA.status).toBe('PAUSED'), { timeout: 2000 });

    // Trigger the 60s grace timer via scheduler
    const triggeredGrace = scheduler.trigger((t) => t.ms === REJOIN_GRACE_MS);
    expect(triggeredGrace).toBe(true);

    await vi.waitFor(() => expect(stateA.status).toBe('GAME_OVER'), { timeout: 2000 });
    expect(stateA.endedReason).toBe('PLAYER_ABANDONED');
    expect(stateA.abandonedPlayerName).toBe('Charlie');
    expect(stateA.winnerId).toBeUndefined();

    // 12. Host issues PLAY_AGAIN -> returns to LOBBY
    clientA.emit(CLIENT_EVENTS.PLAY_AGAIN, {});
    await vi.waitFor(() => expect(roomViewA?.status).toBe('LOBBY'), { timeout: 2000 });
    expect(room.status).toBe('LOBBY');
    expect(room.gameState).toBeNull();

    // 13. Card privacy assertion:
    // Assert that every frame client A received never contained any card id from Bob's or Charlie's hand,
    // except inside challenge_result.revealedCards
    for (const frame of clientAFrames) {
      if (frame.event === SERVER_EVENTS.CHALLENGE_RESULT) {
        const cr = frame.data as ChallengeResult;
        const revealedCardIds = new Set(cr.revealedCards.map((c) => c.id));
        const json = JSON.stringify(frame.data);
        for (const cardId of opponentCardIds) {
          if (!revealedCardIds.has(cardId)) {
            expect(json).not.toContain(cardId);
          }
        }
      } else {
        const json = JSON.stringify(frame.data);
        for (const cardId of opponentCardIds) {
          expect(json).not.toContain(cardId);
        }
      }
    }
  });
});
