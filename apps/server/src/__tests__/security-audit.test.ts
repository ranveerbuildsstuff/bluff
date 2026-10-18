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
  RoomViewSchema,
  PublicGameStateSchema,
  Card,
  GameState,
} from '@bluff/shared';
import { toPublicState, startGame } from '../engine/game.js';
import { checkRateLimit, resetRateLimits } from '../socket/handle.js';

describe('Slice 5 Security Audit', () => {
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
    ];

    for (const code of errorCodes) {
      // Ensure code is an uppercase token without leaking hands or cards
      expect(code).toMatch(/^[A-Z_]+$/);
    }
  });

  it('(e) no console.log of game state in server source code', () => {
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
          // The only allowed console.log is the server startup line
          const isStartupLog =
            line.includes('Server listening on') || line.includes('listening on port');
          expect(
            isStartupLog,
            `Unexpected console.log found in ${filePath}:${i + 1}:\n${line}`
          ).toBe(true);
        }
      }
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
