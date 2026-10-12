import { describe, it, expect } from 'vitest';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  toRoomView,
} from '../engine/room.js';

describe('Room Engine Logic', () => {
  it('creates room with host as first player in LOBBY state', () => {
    const { room, hostPlayer } = createRoom('TESTCD', 'Alice', 'socket-1');
    expect(room.roomCode).toBe('TESTCD');
    expect(room.status).toBe('LOBBY');
    expect(room.hostId).toBe(hostPlayer.playerId);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].name).toBe('Alice');
    expect(room.players[0].connected).toBe(true);
    expect(room.players[0].socketId).toBe('socket-1');
  });

  it('rejects join when room is not in LOBBY', () => {
    const { room } = createRoom('TESTCD', 'Host');
    room.status = 'PLAYING';

    const result = joinRoom(room, 'Player2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ROOM_NOT_IN_LOBBY');
    }
  });

  it('rejects join when room is full (max 8 players)', () => {
    const { room } = createRoom('TESTCD', 'Host');

    for (let i = 2; i <= 8; i++) {
      const res = joinRoom(room, `Player${i}`);
      expect(res.ok).toBe(true);
    }
    expect(room.players).toHaveLength(8);

    const fullResult = joinRoom(room, 'Player9');
    expect(fullResult.ok).toBe(false);
    if (!fullResult.ok) {
      expect(fullResult.code).toBe('ROOM_FULL');
    }
  });

  it('transfers host to the next player when host leaves the lobby', () => {
    const { room, hostPlayer } = createRoom('TESTCD', 'Alice');
    const p2Result = joinRoom(room, 'Bob');
    const p3Result = joinRoom(room, 'Charlie');

    expect(p2Result.ok).toBe(true);
    expect(p3Result.ok).toBe(true);
    if (!p2Result.ok || !p3Result.ok) return;

    expect(room.hostId).toBe(hostPlayer.playerId);

    // Host leaves
    const outcome = leaveRoom(room, hostPlayer.playerId);
    expect(outcome.transferredHost).toBe(true);
    expect(outcome.newHostId).toBe(p2Result.player.playerId);
    expect(room.hostId).toBe(p2Result.player.playerId);
    expect(room.players).toHaveLength(2);
    expect(room.players[0].playerId).toBe(p2Result.player.playerId);

    // Non-host (Charlie) leaves
    const outcome2 = leaveRoom(room, p3Result.player.playerId);
    expect(outcome2.transferredHost).toBe(false);
    expect(outcome2.newHostId).toBe(p2Result.player.playerId);
    expect(room.hostId).toBe(p2Result.player.playerId);
    expect(room.players).toHaveLength(1);

    // Last player leaves -> room becomes null
    const outcome3 = leaveRoom(room, p2Result.player.playerId);
    expect(outcome3.room).toBeNull();
    expect(outcome3.newHostId).toBeNull();
  });

  it('toRoomView strips sensitive tokens and socket IDs', () => {
    const { room } = createRoom('TESTCD', 'Alice', 'socket-123');
    const view = toRoomView(room);

    expect(view.roomCode).toBe('TESTCD');
    expect(view.players[0].playerId).toBe(room.players[0].playerId);
    expect(view.players[0].name).toBe('Alice');
    expect(view.players[0].connected).toBe(true);

    // Ensure sessionToken and socketId are NOT present on player view
    expect('sessionToken' in view.players[0]).toBe(false);
    expect('socketId' in view.players[0]).toBe(false);
  });
});
