import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomManager, Scheduler } from '../room-manager.js';

describe('Leave Room and Lobby Disconnect Cleanup', () => {
  let roomManager: RoomManager;
  let customScheduler: Scheduler;
  let scheduledTasks: Map<number, { fn: () => void; time: number }>;
  let currentTime: number;
  let nextTimerId: number;

  beforeEach(() => {
    currentTime = 0;
    nextTimerId = 1;
    scheduledTasks = new Map();

    customScheduler = {
      setTimeout: (fn: () => void, ms: number) => {
        const id = nextTimerId++;
        scheduledTasks.set(id, { fn, time: currentTime + ms });
        return id;
      },
      clearTimeout: (id: unknown) => {
        scheduledTasks.delete(id as number);
      },
    };

    roomManager = new RoomManager(customScheduler);
  });

  afterEach(() => {
    roomManager.clearAll();
  });

  function advanceTime(ms: number) {
    currentTime += ms;
    // Execute any tasks whose scheduled time has arrived
    const toExecute: (() => void)[] = [];
    for (const [id, task] of scheduledTasks.entries()) {
      if (task.time <= currentTime) {
        toExecute.push(task.fn);
        scheduledTasks.delete(id);
      }
    }
    for (const fn of toExecute) {
      fn();
    }
  }

  it('leave removes player and frees the slot', () => {
    const { room: r1, hostPlayer } = roomManager.createRoom('Alice', 'sock-alice');
    const roomCode = r1.roomCode;

    // Fill room to 8 players
    const joinedPlayers = [];
    for (let i = 2; i <= 8; i++) {
      const res = roomManager.joinRoom(roomCode, `Player${i}`, `sock-${i}`);
      expect(res.ok).toBe(true);
      if (res.ok) joinedPlayers.push(res.player);
    }

    const currentRoom = roomManager.getRoom(roomCode)!;
    expect(currentRoom.players).toHaveLength(8);

    // 9th player cannot join
    const fullRes = roomManager.joinRoom(roomCode, 'Player9', 'sock-9');
    expect(fullRes.ok).toBe(false);

    // One player leaves
    const leaver = joinedPlayers[0]; // Player2
    const leaveOutcome = roomManager.leaveRoom(roomCode, leaver.playerId);
    expect(leaveOutcome.room).not.toBeNull();
    expect(leaveOutcome.room!.players).toHaveLength(7);
    expect(leaveOutcome.room!.players.some((p) => p.playerId === leaver.playerId)).toBe(false);

    // Now slot is freed: Player9 can join
    const joinAfterLeave = roomManager.joinRoom(roomCode, 'Player9', 'sock-9');
    expect(joinAfterLeave.ok).toBe(true);
    expect(roomManager.getRoom(roomCode)!.players).toHaveLength(8);
  });

  it('host transfer on host leave', () => {
    const { room, hostPlayer } = roomManager.createRoom('Alice', 'sock-alice');
    const p2Res = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-bob');
    const p3Res = roomManager.joinRoom(room.roomCode, 'Charlie', 'sock-charlie');
    expect(p2Res.ok).toBe(true);
    expect(p3Res.ok).toBe(true);
    if (!p2Res.ok || !p3Res.ok) return;

    expect(room.hostId).toBe(hostPlayer.playerId);

    // Host leaves
    const outcome = roomManager.leaveRoom(room.roomCode, hostPlayer.playerId);
    expect(outcome.transferredHost).toBe(true);
    expect(outcome.newHostId).toBe(p2Res.player.playerId);
    expect(outcome.room!.hostId).toBe(p2Res.player.playerId);
    expect(outcome.room!.players[0].playerId).toBe(p2Res.player.playerId);
  });

  it('offline player is removed automatically after 60 s in LOBBY', () => {
    const onRoomChange = vi.fn();
    roomManager.setOnRoomChange(onRoomChange);

    const { room, hostPlayer } = roomManager.createRoom('Alice', 'sock-alice');
    const p2Res = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-bob');
    expect(p2Res.ok).toBe(true);
    if (!p2Res.ok) return;

    // Bob disconnects
    const dcResult = roomManager.disconnectSocket('sock-bob');
    expect(dcResult).not.toBeNull();
    expect(dcResult!.player.connected).toBe(false);

    // At 59 seconds: Bob is still in the room as offline
    advanceTime(59000);
    const roomAt59s = roomManager.getRoom(room.roomCode)!;
    expect(roomAt59s.players).toHaveLength(2);
    expect(roomAt59s.players.find((p) => p.playerId === p2Res.player.playerId)?.connected).toBe(false);
    expect(onRoomChange).not.toHaveBeenCalled();

    // At 60 seconds: Bob is removed from room
    advanceTime(1000);
    const roomAt60s = roomManager.getRoom(room.roomCode)!;
    expect(roomAt60s.players).toHaveLength(1);
    expect(roomAt60s.players[0].playerId).toBe(hostPlayer.playerId);
    expect(onRoomChange).toHaveBeenCalledTimes(1);
    expect(onRoomChange).toHaveBeenCalledWith(roomAt60s, room.roomCode);
  });

  it('rejoin before 60 s keeps the player in the room', () => {
    const { room, hostPlayer } = roomManager.createRoom('Alice', 'sock-alice');
    const p2Res = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-bob');
    expect(p2Res.ok).toBe(true);
    if (!p2Res.ok) return;

    // Bob disconnects
    roomManager.disconnectSocket('sock-bob');
    expect(p2Res.player.connected).toBe(false);

    // 30 seconds pass
    advanceTime(30000);

    // Bob rejoins with sessionToken
    const reattachResult = roomManager.reattachBySessionToken(p2Res.player.sessionToken, 'sock-bob-new');
    expect(reattachResult).not.toBeNull();
    expect(reattachResult!.player.connected).toBe(true);
    expect(reattachResult!.player.socketId).toBe('sock-bob-new');

    // Another 40 seconds pass (total 70s since disconnect)
    advanceTime(40000);

    // Bob is still in the room!
    const roomState = roomManager.getRoom(room.roomCode)!;
    expect(roomState.players).toHaveLength(2);
    expect(roomState.players.find((p) => p.playerId === p2Res.player.playerId)?.connected).toBe(true);
  });

  it('last player leaving deletes the room', () => {
    const { room, hostPlayer } = roomManager.createRoom('Alice', 'sock-alice');
    const roomCode = room.roomCode;
    expect(roomManager.getRoom(roomCode)).toBeDefined();

    // Sole player leaves
    const outcome = roomManager.leaveRoom(roomCode, hostPlayer.playerId);
    expect(outcome.room).toBeNull();
    expect(outcome.newHostId).toBeNull();
    expect(roomManager.getRoom(roomCode)).toBeUndefined();
  });

  it('last player disconnecting is removed after 60s and room is deleted', () => {
    const { room, hostPlayer } = roomManager.createRoom('Alice', 'sock-alice');
    const roomCode = room.roomCode;

    roomManager.disconnectSocket('sock-alice');
    expect(roomManager.getRoom(roomCode)!.players[0].connected).toBe(false);

    // Advance 60s
    advanceTime(60000);

    // Room is now deleted
    expect(roomManager.getRoom(roomCode)).toBeUndefined();
  });
});
