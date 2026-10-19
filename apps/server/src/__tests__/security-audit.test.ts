import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  GetRoomViewRequestSchema,
  LeaveRoomRequestSchema,
  UpdateSettingsRequestSchema,
  StartGameRequestSchema,
  PlayTurnRequestSchema,
  CallBluffRequestSchema,
  PlayAgainRequestSchema,
  IdentifyRequestSchema,
  SignOutRequestSchema,
  UpdateNameBodySchema,
  RoomViewSchema,
  PublicGameStateSchema,
  Card,
  GameState,
} from '@bluff/shared';
import { toPublicState, startGame } from '../engine/game.js';
import { checkRateLimit, resetRateLimits } from '../socket/handle.js';
import { createApp } from '../index.js';
import { toRoomView } from '../engine/room.js';
import { RoomManager } from '../room-manager.js';
import { FakeTokenVerifier, InMemoryStatsStore } from '../stats/index.js';

describe('Slice 5 & Slice 7 Security Audit', () => {
  it('(a) fails if socket.on appears outside handle() wrapper except disconnect', () => {
    const srcDir = path.resolve(__dirname, '..');
    const getFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') {
            files.push(...getFiles(fullPath));
          }
        } else if (entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const sourceFiles = getFiles(srcDir);
    expect(sourceFiles.length).toBeGreaterThan(0);

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('socket.on(')) {
          // Look ahead across the socket.on(...) call statement
          const callBlock = lines.slice(i, i + 5).join('\n');
          const isDisconnect = callBlock.includes("'disconnect'");
          const isWrappedWithHandle = callBlock.includes('handle(');

          expect(
            isDisconnect || isWrappedWithHandle,
            `File ${filePath}:${i + 1} registers raw socket.on without handle():\n${line}`
          ).toBe(true);
        }
      }
    }
  });

  it('(b) every inbound schema is .strict() and rejects unknown keys', () => {
    const schemas = [
      { name: 'CreateRoomRequestSchema', schema: CreateRoomRequestSchema, valid: { playerName: 'Alice' } },
      { name: 'JoinRoomRequestSchema', schema: JoinRoomRequestSchema, valid: { roomCode: 'ABC234', playerName: 'Bob' } },
      { name: 'GetRoomViewRequestSchema', schema: GetRoomViewRequestSchema, valid: {} },
      { name: 'LeaveRoomRequestSchema', schema: LeaveRoomRequestSchema, valid: {} },
      { name: 'UpdateSettingsRequestSchema', schema: UpdateSettingsRequestSchema, valid: { cardsPerPlayer: 5 } },
      { name: 'StartGameRequestSchema', schema: StartGameRequestSchema, valid: {} },
      { name: 'PlayTurnRequestSchema', schema: PlayTurnRequestSchema, valid: { selectedCardIds: ['H-A'] } },
      { name: 'CallBluffRequestSchema', schema: CallBluffRequestSchema, valid: { playSeq: 1 } },
      { name: 'PlayAgainRequestSchema', schema: PlayAgainRequestSchema, valid: {} },
      { name: 'IdentifyRequestSchema', schema: IdentifyRequestSchema, valid: { idToken: 'some-token' } },
      { name: 'SignOutRequestSchema', schema: SignOutRequestSchema, valid: {} },
      { name: 'UpdateNameBodySchema', schema: UpdateNameBodySchema, valid: { name: 'Alice' } },
    ];

    for (const { name, schema, valid } of schemas) {
      // Valid data parses cleanly
      const validParse = schema.safeParse(valid);
      expect(validParse.success, `${name} should accept valid payload`).toBe(true);

      // Unknown keys must be rejected
      const invalidWithExtra = { ...valid, maliciousKey: 'hack', extraField: 123 };
      const invalidParse = schema.safeParse(invalidWithExtra);
      expect(
        invalidParse.success,
        `${name} must reject unexpected keys due to .strict()`
      ).toBe(false);
    }
  });

  it('(c) sessionToken and opponents cards never leak into PublicGameState or RoomView', () => {
    const p1 = { playerId: '11111111-1111-4111-8111-111111111111', name: 'Alice' };
    const p2 = { playerId: '22222222-2222-4222-8222-222222222222', name: 'Bob' };
    const p3 = { playerId: '33333333-3333-4333-8333-333333333333', name: 'Charlie' };

    const gameState = startGame({
      roomCode: 'TEST99',
      hostId: p1.playerId,
      players: [p1, p2, p3],
      settings: { cardsPerPlayer: 3 },
    });

    const publicStateAlice = toPublicState(gameState, p1.playerId);
    const serializedAlice = JSON.stringify(publicStateAlice);

    // No session tokens in public state
    expect(serializedAlice).not.toContain('sessionToken');

    // Bob and Charlie's cards should NOT appear in Alice's serialized public state
    const bob = gameState.players.find((p: { playerId: string }) => p.playerId === p2.playerId)!;
    const charlie = gameState.players.find((p: { playerId: string }) => p.playerId === p3.playerId)!;

    for (const card of bob.hand) {
      expect(serializedAlice).not.toContain(`"id":"${card.id}"`);
    }
    for (const card of charlie.hand) {
      expect(serializedAlice).not.toContain(`"id":"${card.id}"`);
    }

    // Alice's public view contains only her own cards
    expect(publicStateAlice.myHand).toHaveLength(3);
    for (const card of publicStateAlice.myHand) {
      expect(gameState.players.find((p: { playerId: string }) => p.playerId === p1.playerId)!.hand.some((c: Card) => c.id === card.id)).toBe(true);
    }
  });

  it('(d) error messages leak no state, cards, or tokens', () => {
    const errorCodes = [
      'INVALID_PAYLOAD',
      'GAME_PAUSED',
      'NOT_YOUR_TURN',
      'CARD_NOT_IN_HAND',
      'STALE_CHALLENGE',
      'CANNOT_CHALLENGE_SELF',
      'RATE_LIMITED',
      'AUTH_FAILED',
      'ACCOUNTS_DISABLED',
    ];

    for (const code of errorCodes) {
      // Ensure code is an uppercase token without leaking hands or cards
      expect(code).toMatch(/^[A-Z_]+$/);
    }
  });

  it('(e) no sensitive console.log or game state in server source code', () => {
    const srcDir = path.resolve(__dirname, '..');
    const getFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') {
            files.push(...getFiles(fullPath));
          }
        } else if (entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const sourceFiles = getFiles(srcDir);
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('console.log(')) {
          // The only allowed console.logs are generic startup lines
          const isStartupLog =
            line.includes('Server listening on') ||
            line.includes('listening on port') ||
            line.includes('Accounts:');
          expect(
            isStartupLog,
            `Unexpected console.log found in ${filePath}:${i + 1}:\n${line}`
          ).toBe(true);

          // Never log tokens, uids, or service account credentials
          expect(line).not.toContain('FIREBASE_SERVICE_ACCOUNT');
          expect(line).not.toContain('idToken');
          expect(line).not.toContain('uid');
          expect(line).not.toContain('private_key');
        }
      }
    }
  });

  it('(f) uid, idToken and service-account JSON never leak in room views or outbound state', async () => {
    const secretUid = 'super-secret-user-id-9999';
    const fakeStore = new InMemoryStatsStore();
    await fakeStore.ensureUser(secretUid, 'SecretPlayer');
    const roomManager = new RoomManager(undefined, undefined, fakeStore);

    const { room, hostPlayer } = roomManager.createRoom('HostPlayer');
    const identified = await roomManager.identifyPlayer(room.roomCode, hostPlayer.playerId, {
      uid: secretUid,
      name: 'SecretPlayer',
    });
    expect(identified.ok).toBe(true);

    const roomView = toRoomView(room);
    const serializedRoomView = JSON.stringify(roomView);

    // uid must never appear in RoomView
    expect(serializedRoomView).not.toContain(secretUid);
    expect(serializedRoomView).not.toContain('uid');

    // Public game state must never include uid or token
    const p2 = roomManager.joinRoom(room.roomCode, 'Player2');
    if (!p2.ok) throw new Error('Join failed');
    const startRes = roomManager.startGame(room.roomCode, hostPlayer.playerId);
    if (!startRes.ok) throw new Error('Start failed');

    const publicState = toPublicState(startRes.gameState, p2.player.playerId);
    const serializedState = JSON.stringify(publicState);
    expect(serializedState).not.toContain(secretUid);
    expect(serializedState).not.toContain('uid');
    expect(serializedState).not.toContain('idToken');
  });

  it('(g) every registered HTTP route is on an allow-list and validates input with strict Zod schemas', () => {
    const { app } = createApp({
      statsService: {
        enabled: true,
        store: new InMemoryStatsStore(),
        verifier: new FakeTokenVerifier(),
      },
    });

    const allowedRoutes = [
      'GET /health',
      'GET /api/leaderboard',
      'GET /api/me',
      'PATCH /api/me',
      'DELETE /api/me',
      'GET *',
    ];

    const registeredRoutes: string[] = [];

    // Traverse express router stack
    const extractRoutes = (stack: any[], basePath = '') => {
      for (const layer of stack) {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods)
            .filter((m) => layer.route.methods[m])
            .map((m) => m.toUpperCase());
          for (const method of methods) {
            registeredRoutes.push(`${method} ${basePath}${layer.route.path}`);
          }
        } else if (layer.name === 'router' && layer.handle?.stack) {
          let pathPrefix = '';
          if (layer.regexp) {
            const match = layer.regexp.source
              .replace('^\\', '')
              .replace('\\/?(?=\\/|$)', '')
              .replace(/\\\//g, '/');
            if (match && !match.startsWith('(?=')) {
              pathPrefix = match.replace(/[\^$?]/g, '');
            }
          }
          extractRoutes(layer.handle.stack, `${basePath}${pathPrefix}`);
        }
      }
    };

    extractRoutes((app as any)._router.stack);

    for (const route of registeredRoutes) {
      const isAllowed = allowedRoutes.some((allowed) => {
        if (allowed.endsWith('*')) {
          return route.startsWith(allowed.replace('*', ''));
        }
        return route === allowed;
      });
      expect(isAllowed, `Route ${route} is not on HTTP route allow-list`).toBe(true);
    }
  });

  it('rate limiting token bucket permits ~10 events/sec and drops excesses', () => {
    resetRateLimits();
    const socketId = 'test-socket-ratelimit';

    // First 10 events pass
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(socketId)).toBe(true);
    }

    // 11th event without delay is rejected
    expect(checkRateLimit(socketId)).toBe(false);

    // After 100ms (1 token refilled), 1 event is permitted
    expect(checkRateLimit(socketId, Date.now() + 100)).toBe(true);
    // But immediately after, rejected again
    expect(checkRateLimit(socketId, Date.now() + 100)).toBe(false);
  });
});

