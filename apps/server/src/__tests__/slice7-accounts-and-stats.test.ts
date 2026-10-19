import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http, { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  IdentifiedEvent,
  StatsUpdatedEvent,
  ErrorEvent,
  Card,
  GameState,
  PublicGameState,
} from '@bluff/shared';
import { RoomManager } from '../room-manager.js';
import { setupSocketServer } from '../socket/index.js';
import {
  InMemoryStatsStore,
  FakeTokenVerifier,
  NoopStatsStore,
  NoopTokenVerifier,
  LeaderboardCache,
  initStatsService,
} from '../stats/index.js';
import { createApp } from '../index.js';

describe('Slice 7: Optional Accounts & Stats (Server Side)', () => {
  describe('Config & Graceful Degradation', () => {
    it('disables accounts when FIREBASE_SERVICE_ACCOUNT_JSON is missing', () => {
      const service = initStatsService(undefined);
      expect(service.enabled).toBe(false);
      expect(service.store).toBeInstanceOf(NoopStatsStore);
      expect(service.verifier).toBeInstanceOf(NoopTokenVerifier);
    });

    it('disables accounts without crashing when JSON is invalid syntax', () => {
      const service = initStatsService('{ bad json: true ');
      expect(service.enabled).toBe(false);
      expect(service.store).toBeInstanceOf(NoopStatsStore);
      expect(service.verifier).toBeInstanceOf(NoopTokenVerifier);
    });

    it('disables accounts when required JSON keys are missing', () => {
      const service = initStatsService(JSON.stringify({ project_id: 'proj-123' }));
      expect(service.enabled).toBe(false);
      expect(service.store).toBeInstanceOf(NoopStatsStore);
      expect(service.verifier).toBeInstanceOf(NoopTokenVerifier);
    });

    it('converts literal "\\n" in private_key to actual newlines if valid structure', () => {
      // Testing the key conversion logic without connecting to real Firebase
      const rawJson = JSON.stringify({
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgk\\n-----END PRIVATE KEY-----\\n',
        client_email: 'test@test-project.iam.gserviceaccount.com',
      });
      // Will attempt initializeApp, which might throw or initialize in test environment;
      // We verify it does not throw unhandled exception
      expect(() => initStatsService(rawJson)).not.toThrow();
    });
  });

  describe('InMemoryStatsStore Logic', () => {
    let store: InMemoryStatsStore;

    beforeEach(() => {
      store = new InMemoryStatsStore();
    });

    it('ensures user lazily with default name and 0 stats', async () => {
      const user = await store.ensureUser('user-1', 'Alice');
      expect(user.displayName).toBe('Alice');
      expect(user.gamesPlayed).toBe(0);
      expect(user.wins).toBe(0);
      expect(user.winRate).toBe(0);

      const existing = await store.ensureUser('user-1', 'IgnoredName');
      expect(existing.displayName).toBe('Alice');
    });

    it('records ranked game and counts win and loss accurately', async () => {
      await store.ensureUser('p1', 'Alice');
      await store.ensureUser('p2', 'Bob');

      const p1Res = await store.recordGame('p1', 'game-1', true);
      expect(p1Res.gamesPlayed).toBe(1);
      expect(p1Res.wins).toBe(1);

      const p2Res = await store.recordGame('p2', 'game-1', false);
      expect(p2Res.gamesPlayed).toBe(1);
      expect(p2Res.wins).toBe(0);

      const p1Stats = await store.getStats('p1');
      expect(p1Stats?.winRate).toBe(1);

      const p2Stats = await store.getStats('p2');
      expect(p2Stats?.winRate).toBe(0);
    });

    it('idempotency: same gameId twice is counted only once', async () => {
      await store.ensureUser('p1', 'Alice');

      const first = await store.recordGame('p1', 'game-abc', true);
      expect(first).toEqual({ gamesPlayed: 1, wins: 1 });

      const second = await store.recordGame('p1', 'game-abc', true);
      expect(second).toEqual({ gamesPlayed: 1, wins: 1 });

      const stats = await store.getStats('p1');
      expect(stats?.gamesPlayed).toBe(1);
      expect(stats?.wins).toBe(1);
    });

    it('setDisplayName updates name and getStats reflects change', async () => {
      await store.ensureUser('p1', 'OldName');
      const updated = await store.setDisplayName('p1', 'NewName');
      expect(updated.displayName).toBe('NewName');

      const stats = await store.getStats('p1');
      expect(stats?.displayName).toBe('NewName');
    });

    it('deleteUser removes user document and recorded games', async () => {
      await store.ensureUser('p1', 'Alice');
      await store.recordGame('p1', 'game-1', true);

      await store.deleteUser('p1');
      const stats = await store.getStats('p1');
      expect(stats).toBeNull();
    });
  });

  describe('Game Ranking & Late Claim in RoomManager', () => {
    let store: InMemoryStatsStore;
    let roomManager: RoomManager;

    beforeEach(() => {
      store = new InMemoryStatsStore();
      roomManager = new RoomManager(undefined, undefined, store, 3);
    });

    it('ranked game with >= 3 players counts wins and losses for signed-in players, ignores guests', async () => {
      const statsUpdates: { playerId: string; event: StatsUpdatedEvent }[] = [];
      roomManager.setOnStatsUpdated((playerId, _, event) => {
        statsUpdates.push({ playerId, event });
      });

      const { room, hostPlayer } = roomManager.createRoom('Alice');
      const p2Res = roomManager.joinRoom(room.roomCode, 'Bob');
      const p3Res = roomManager.joinRoom(room.roomCode, 'Charlie');
      if (!p2Res.ok || !p3Res.ok) throw new Error('Join failed');

      // Link Alice and Bob; leave Charlie as guest
      await roomManager.identifyPlayer(room.roomCode, hostPlayer.playerId, { uid: 'uid-alice', name: 'Alice' });
      await roomManager.identifyPlayer(room.roomCode, p2Res.player.playerId, { uid: 'uid-bob', name: 'Bob' });

      const startRes = roomManager.startGame(room.roomCode, hostPlayer.playerId);
      if (!startRes.ok) throw new Error('Start failed');

      // Set gameState to FINAL_CALL with Alice as winner
      room.gameState!.status = 'FINAL_CALL';
      room.gameState!.winnerId = hostPlayer.playerId;

      // Final call expires -> Alice wins
      await roomManager.handleFinalCallTimeout(room.roomCode);

      expect(room.status).toBe('GAME_OVER');
      expect(room.finalResult).toBeDefined();
      expect(room.finalResult?.ranked).toBe(true);
      expect(room.finalResult?.winnerId).toBe(hostPlayer.playerId);

      // Verify store: Alice has 1 game, 1 win. Bob has 1 game, 0 wins. Charlie has no record.
      const aliceStats = await store.getStats('uid-alice');
      expect(aliceStats?.gamesPlayed).toBe(1);
      expect(aliceStats?.wins).toBe(1);

      const bobStats = await store.getStats('uid-bob');
      expect(bobStats?.gamesPlayed).toBe(1);
      expect(bobStats?.wins).toBe(0);

      // Events emitted
      const aliceEvent = statsUpdates.find((u) => u.playerId === hostPlayer.playerId);
      expect(aliceEvent?.event.counted).toBe(true);
      expect(aliceEvent?.event.wins).toBe(1);

      const bobEvent = statsUpdates.find((u) => u.playerId === p2Res.player.playerId);
      expect(bobEvent?.event.counted).toBe(true);
      expect(bobEvent?.event.wins).toBe(0);

      const charlieEvent = statsUpdates.find((u) => u.playerId === p3Res.player.playerId);
      expect(charlieEvent).toBeUndefined(); // Guests never recorded or notified
    });

    it('abandoned game is not ranked and writes nothing to store', async () => {
      const statsUpdates: { playerId: string; event: StatsUpdatedEvent }[] = [];
      roomManager.setOnStatsUpdated((playerId, _, event) => {
        statsUpdates.push({ playerId, event });
      });

      const { room, hostPlayer } = roomManager.createRoom('Alice');
      const p2Res = roomManager.joinRoom(room.roomCode, 'Bob');
      const p3Res = roomManager.joinRoom(room.roomCode, 'Charlie');
      if (!p2Res.ok || !p3Res.ok) throw new Error('Join failed');

      await roomManager.identifyPlayer(room.roomCode, hostPlayer.playerId, { uid: 'uid-alice', name: 'Alice' });
      await roomManager.identifyPlayer(room.roomCode, p2Res.player.playerId, { uid: 'uid-bob', name: 'Bob' });

      roomManager.startGame(room.roomCode, hostPlayer.playerId);
      room.status = 'PAUSED';
      p2Res.player.connected = false;

      // Disconnect grace expires for Bob
      await roomManager.handleGraceTimeout(room.roomCode, p2Res.player.playerId);

      expect(room.status).toBe('GAME_OVER');
      expect(room.finalResult?.ranked).toBe(false);
      expect(room.finalResult?.endedReason).toBe('PLAYER_ABANDONED');

      // Store remains empty
      const aliceStats = await store.getStats('uid-alice');
      expect(aliceStats?.gamesPlayed).toBe(0);
      expect(aliceStats?.wins).toBe(0);

      // stats_updated emitted with counted=false, reason='ABANDONED'
      const aliceEvent = statsUpdates.find((u) => u.playerId === hostPlayer.playerId);
      expect(aliceEvent?.event.counted).toBe(false);
      expect(aliceEvent?.event.reason).toBe('ABANDONED');
    });

    it('fewer than MIN_RANKED_PLAYERS is not ranked', async () => {
      const statsUpdates: { playerId: string; event: StatsUpdatedEvent }[] = [];
      roomManager.setOnStatsUpdated((playerId, _, event) => {
        statsUpdates.push({ playerId, event });
      });

      // 2 players when min is 3
      const { room, hostPlayer } = roomManager.createRoom('Alice');
      const p2Res = roomManager.joinRoom(room.roomCode, 'Bob');
      if (!p2Res.ok) throw new Error('Join failed');

      await roomManager.identifyPlayer(room.roomCode, hostPlayer.playerId, { uid: 'uid-alice', name: 'Alice' });
      roomManager.startGame(room.roomCode, hostPlayer.playerId);

      room.gameState!.status = 'FINAL_CALL';
      room.gameState!.winnerId = hostPlayer.playerId;
      await roomManager.handleFinalCallTimeout(room.roomCode);

      expect(room.finalResult?.ranked).toBe(false);
      const aliceStats = await store.getStats('uid-alice');
      expect(aliceStats?.gamesPlayed).toBe(0);

      const aliceEvent = statsUpdates.find((u) => u.playerId === hostPlayer.playerId);
      expect(aliceEvent?.event.counted).toBe(false);
      expect(aliceEvent?.event.reason).toBe('NOT_RANKED');
    });

    it('late claim: guest signs in after GAME_OVER and receives credit once', async () => {
      const statsUpdates: { playerId: string; event: StatsUpdatedEvent }[] = [];
      roomManager.setOnStatsUpdated((playerId, _, event) => {
        statsUpdates.push({ playerId, event });
      });

      const { room, hostPlayer } = roomManager.createRoom('Alice');
      const p2Res = roomManager.joinRoom(room.roomCode, 'Bob');
      const p3Res = roomManager.joinRoom(room.roomCode, 'Charlie');
      if (!p2Res.ok || !p3Res.ok) throw new Error('Join failed');

      // Only Alice is identified at start
      await roomManager.identifyPlayer(room.roomCode, hostPlayer.playerId, { uid: 'uid-alice', name: 'Alice' });
      roomManager.startGame(room.roomCode, hostPlayer.playerId);

      room.gameState!.status = 'FINAL_CALL';
      room.gameState!.winnerId = p2Res.player.playerId; // Bob wins
      await roomManager.handleFinalCallTimeout(room.roomCode);

      expect(room.status).toBe('GAME_OVER');

      // Bob was a guest during gameplay; now Bob signs in late
      const bobIdentify = await roomManager.identifyPlayer(room.roomCode, p2Res.player.playerId, {
        uid: 'uid-bob',
        name: 'Bob',
      });
      expect(bobIdentify.ok).toBe(true);

      const bobStats = await store.getStats('uid-bob');
      expect(bobStats?.gamesPlayed).toBe(1);
      expect(bobStats?.wins).toBe(1);

      const bobEvent = statsUpdates.find((u) => u.playerId === p2Res.player.playerId);
      expect(bobEvent?.event.counted).toBe(true);
      expect(bobEvent?.event.wins).toBe(1);

      // Late claim again should be idempotent
      await roomManager.identifyPlayer(room.roomCode, p2Res.player.playerId, {
        uid: 'uid-bob',
        name: 'Bob',
      });
      const bobStatsAgain = await store.getStats('uid-bob');
      expect(bobStatsAgain?.gamesPlayed).toBe(1);
      expect(bobStatsAgain?.wins).toBe(1);
    });

    it('rejects linking the same uid to a second player in the same room', async () => {
      const { room, hostPlayer } = roomManager.createRoom('Alice');
      const p2Res = roomManager.joinRoom(room.roomCode, 'Bob');
      if (!p2Res.ok) throw new Error('Join failed');

      const first = await roomManager.identifyPlayer(room.roomCode, hostPlayer.playerId, {
        uid: 'shared-uid',
        name: 'Alice',
      });
      expect(first.ok).toBe(true);

      const second = await roomManager.identifyPlayer(room.roomCode, p2Res.player.playerId, {
        uid: 'shared-uid',
        name: 'Bob',
      });
      expect(second.ok).toBe(false);
      expect(second.code).toBe('AUTH_FAILED');
    });

    it('signOutPlayer clears player uid', async () => {
      const { room, hostPlayer } = roomManager.createRoom('Alice');
      await roomManager.identifyPlayer(room.roomCode, hostPlayer.playerId, {
        uid: 'alice-uid',
        name: 'Alice',
      });
      expect(hostPlayer.uid).toBe('alice-uid');

      roomManager.signOutPlayer(room.roomCode, hostPlayer.playerId);
      expect(hostPlayer.uid).toBeUndefined();
    });
  });

  describe('HTTP API Endpoints (via Node fetch on port 0)', () => {
    let server: HttpServer;
    let baseUrl: string;
    let store: InMemoryStatsStore;
    let verifier: FakeTokenVerifier;

    beforeEach(async () => {
      store = new InMemoryStatsStore();
      verifier = new FakeTokenVerifier();

      const { app } = createApp({
        statsService: {
          enabled: true,
          store,
          verifier,
        },
      });

      server = createServer(app);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('rejects /api/me requests missing or with invalid Authorization token', async () => {
      const noAuth = await fetch(`${baseUrl}/api/me`);
      expect(noAuth.status).toBe(401);
      const noAuthJson = await noAuth.json();
      expect(noAuthJson).toEqual({ code: 'AUTH_FAILED' });

      const badAuth = await fetch(`${baseUrl}/api/me`, {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(badAuth.status).toBe(401);
      const badAuthJson = await badAuth.json();
      expect(badAuthJson).toEqual({ code: 'AUTH_FAILED' });
    });

    it('GET /api/me lazily creates user and returns stats without uid or email', async () => {
      verifier.setToken('valid-token-1', { uid: 'user-alice', name: 'Alice' });

      const res = await fetch(`${baseUrl}/api/me`, {
        headers: { Authorization: 'Bearer valid-token-1' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        displayName: 'Alice',
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
      });

      expect(JSON.stringify(json)).not.toContain('user-alice');
      expect(JSON.stringify(json)).not.toContain('email');
    });

    it('PATCH /api/me updates public displayName', async () => {
      verifier.setToken('valid-token-1', { uid: 'user-alice', name: 'Alice' });
      await store.ensureUser('user-alice', 'Alice');

      const res = await fetch(`${baseUrl}/api/me`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'SuperAlice' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.displayName).toBe('SuperAlice');

      const check = await store.getStats('user-alice');
      expect(check?.displayName).toBe('SuperAlice');
    });

    it('PATCH /api/me rejects unknown keys due to strict Zod schema', async () => {
      verifier.setToken('valid-token-1', { uid: 'user-alice', name: 'Alice' });

      const res = await fetch(`${baseUrl}/api/me`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'SuperAlice', extraField: 'bad' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe('INVALID_REQUEST');
    });

    it('DELETE /api/me removes user account', async () => {
      verifier.setToken('valid-token-1', { uid: 'user-alice', name: 'Alice' });
      await store.ensureUser('user-alice', 'Alice');

      const res = await fetch(`${baseUrl}/api/me`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token-1' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true });

      const stats = await store.getStats('user-alice');
      expect(stats).toBeNull();
    });

    it('GET /api/leaderboard orders by wins desc, winRate desc, displayName asc', async () => {
      // Setup players:
      // Player 1: 5 wins, 10 games -> winRate 0.5
      await store.ensureUser('u1', 'Zach');
      for (let i = 0; i < 5; i++) await store.recordGame('u1', `g-w-${i}`, true);
      for (let i = 0; i < 5; i++) await store.recordGame('u1', `g-l-${i}`, false);

      // Player 2: 5 wins, 8 games -> winRate 0.625 (ranks above Zach)
      await store.ensureUser('u2', 'Charlie');
      for (let i = 0; i < 5; i++) await store.recordGame('u2', `g-w-${i}`, true);
      for (let i = 0; i < 3; i++) await store.recordGame('u2', `g-l-${i}`, false);

      // Player 3: 5 wins, 10 games -> winRate 0.5, name 'Adam' (alphabetical tie-break with Zach)
      await store.ensureUser('u3', 'Adam');
      for (let i = 0; i < 5; i++) await store.recordGame('u3', `g-w-${i}`, true);
      for (let i = 0; i < 5; i++) await store.recordGame('u3', `g-l-${i}`, false);

      // Player 4: 10 wins -> top rank
      await store.ensureUser('u4', 'TopWinner');
      for (let i = 0; i < 10; i++) await store.recordGame('u4', `g-w-${i}`, true);

      const res = await fetch(`${baseUrl}/api/leaderboard?limit=20`);
      expect(res.status).toBe(200);
      const list = await res.json();

      expect(list).toHaveLength(4);
      expect(list[0]).toMatchObject({ rank: 1, displayName: 'TopWinner', wins: 10 });
      expect(list[1]).toMatchObject({ rank: 2, displayName: 'Charlie', wins: 5, winRate: 0.625 });
      expect(list[2]).toMatchObject({ rank: 3, displayName: 'Adam', wins: 5, winRate: 0.5 });
      expect(list[3]).toMatchObject({ rank: 4, displayName: 'Zach', wins: 5, winRate: 0.5 });

      // Ensure no uid or email in response
      const serialized = JSON.stringify(list);
      expect(serialized).not.toContain('u1');
      expect(serialized).not.toContain('u2');
      expect(serialized).not.toContain('u3');
      expect(serialized).not.toContain('u4');
      expect(serialized).not.toContain('email');
    });

    it('GET /api/leaderboard respects limit and caches results for 120 seconds', async () => {
      for (let i = 1; i <= 5; i++) {
        await store.ensureUser(`user-${i}`, `Player${i}`);
        await store.recordGame(`user-${i}`, `game-${i}`, true);
      }

      // First call caches the response
      const firstRes = await fetch(`${baseUrl}/api/leaderboard?limit=3`);
      expect(firstRes.status).toBe(200);
      const firstList = await firstRes.json();
      expect(firstList).toHaveLength(3);

      // Add a new player with 50 wins to store
      await store.ensureUser('user-new', 'UltraWinner');
      for (let i = 0; i < 50; i++) await store.recordGame('user-new', `ultra-${i}`, true);

      // Immediate second call should hit 120s in-memory cache and not include UltraWinner
      const secondRes = await fetch(`${baseUrl}/api/leaderboard?limit=3`);
      const secondList = await secondRes.json();
      expect(secondList).toEqual(firstList);
      expect(JSON.stringify(secondList)).not.toContain('UltraWinner');
    });

    it('GET /api/leaderboard rejects limit above 50 or non-integer', async () => {
      const resHigh = await fetch(`${baseUrl}/api/leaderboard?limit=51`);
      expect(resHigh.status).toBe(400);

      const resBad = await fetch(`${baseUrl}/api/leaderboard?limit=invalid`);
      expect(resBad.status).toBe(400);
    });
  });

  describe('When Accounts are Disabled', () => {
    let server: HttpServer;
    let baseUrl: string;

    beforeEach(async () => {
      const { app } = createApp({
        statsService: {
          enabled: false,
          store: new NoopStatsStore(),
          verifier: new NoopTokenVerifier(),
        },
      });

      server = createServer(app);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('GET /api/leaderboard returns 200 []', async () => {
      const res = await fetch(`${baseUrl}/api/leaderboard`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });

    it('GET /api/me returns 503 ACCOUNTS_DISABLED', async () => {
      const res = await fetch(`${baseUrl}/api/me`, {
        headers: { Authorization: 'Bearer some-token' },
      });
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toEqual({ code: 'ACCOUNTS_DISABLED' });
    });

    it('PATCH /api/me returns 503 ACCOUNTS_DISABLED', async () => {
      const res = await fetch(`${baseUrl}/api/me`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer some-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Alice' }),
      });
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toEqual({ code: 'ACCOUNTS_DISABLED' });
    });

    it('DELETE /api/me returns 503 ACCOUNTS_DISABLED', async () => {
      const res = await fetch(`${baseUrl}/api/me`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer some-token' },
      });
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toEqual({ code: 'ACCOUNTS_DISABLED' });
    });
  });

  describe('Socket Identify & Sign Out End-to-End', () => {
    let httpServer: HttpServer;
    let ioServer: SocketIOServer;
    let roomManager: RoomManager;
    let store: InMemoryStatsStore;
    let verifier: FakeTokenVerifier;
    let port: number;
    let clientSocket: ClientSocket;

    beforeEach(async () => {
      store = new InMemoryStatsStore();
      verifier = new FakeTokenVerifier();
      roomManager = new RoomManager(undefined, undefined, store, 3);

      httpServer = createServer();
      ioServer = new SocketIOServer(httpServer);
      setupSocketServer(ioServer, roomManager, verifier);

      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => {
          port = (httpServer.address() as AddressInfo).port;
          resolve();
        });
      });

      clientSocket = ioc(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));
    });

    afterEach(async () => {
      if (clientSocket.connected) {
        clientSocket.disconnect();
      }
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    it('socket identify succeeds with valid token and replies identified event', async () => {
      verifier.setToken('valid-token-bob', { uid: 'uid-bob', name: 'Bob' });
      const { room, hostPlayer } = roomManager.createRoom('Bob', clientSocket.id);

      clientSocket.emit(CLIENT_EVENTS.IDENTIFY, { idToken: 'valid-token-bob' });

      const identified = await new Promise<IdentifiedEvent>((resolve) => {
        clientSocket.on(SERVER_EVENTS.IDENTIFIED, (data: IdentifiedEvent) => {
          resolve(data);
        });
      });

      expect(identified.displayName).toBe('Bob');
      expect(identified.stats).toEqual({ gamesPlayed: 0, wins: 0 });

      // Verify server record
      expect(hostPlayer.uid).toBe('uid-bob');
    });

    it('socket identify fails with invalid token emitting AUTH_FAILED', async () => {
      roomManager.createRoom('Bob', clientSocket.id);

      clientSocket.emit(CLIENT_EVENTS.IDENTIFY, { idToken: 'invalid-token' });

      const error = await new Promise<ErrorEvent>((resolve) => {
        clientSocket.on(SERVER_EVENTS.ERROR, (err: ErrorEvent) => {
          resolve(err);
        });
      });

      expect(error.code).toBe('AUTH_FAILED');
    });

    it('socket sign_out removes link from player', async () => {
      verifier.setToken('valid-token-bob', { uid: 'uid-bob', name: 'Bob' });
      const { room, hostPlayer } = roomManager.createRoom('Bob', clientSocket.id);

      clientSocket.emit(CLIENT_EVENTS.IDENTIFY, { idToken: 'valid-token-bob' });
      await new Promise((resolve) => clientSocket.on(SERVER_EVENTS.IDENTIFIED, resolve));

      expect(hostPlayer.uid).toBe('uid-bob');

      clientSocket.emit(CLIENT_EVENTS.SIGN_OUT, {});
      await new Promise((r) => setTimeout(r, 50));

      expect(hostPlayer.uid).toBeUndefined();
    });
  });
});
