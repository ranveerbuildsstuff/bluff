import {
  RoomState,
  PlayerRecord,
  createRoom as engineCreateRoom,
  joinRoom as engineJoinRoom,
  leaveRoom as engineLeaveRoom,
  disconnectPlayer as engineDisconnectPlayer,
  reattachPlayer as engineReattachPlayer,
  JoinRoomResult,
} from './engine/room.js';
import { generateUniqueRoomCode } from './engine/room-code.js';

export const ROOM_CLEANUP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export class RoomManager {
  private rooms = new Map<string, RoomState>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  public getRoom(roomCode: string): RoomState | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  public getAllRooms(): Map<string, RoomState> {
    return this.rooms;
  }

  public createRoom(
    hostPlayerName: string,
    socketId: string | null = null
  ): { room: RoomState; hostPlayer: PlayerRecord } {
    const roomCode = generateUniqueRoomCode((code) => this.rooms.has(code));
    const { room, hostPlayer } = engineCreateRoom(roomCode, hostPlayerName, socketId);
    this.rooms.set(roomCode, room);
    this.cancelCleanupTimer(roomCode);
    return { room, hostPlayer };
  }

  public joinRoom(
    roomCode: string,
    playerName: string,
    socketId: string | null = null
  ): JoinRoomResult | { ok: false; code: 'ROOM_NOT_FOUND'; message: string } {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        message: `Room "${code}" does not exist`,
      };
    }

    const result = engineJoinRoom(room, playerName, socketId);
    if (result.ok) {
      this.cancelCleanupTimer(code);
    }
    return result;
  }

  public leaveRoom(
    roomCode: string,
    playerId: string
  ): {
    room: RoomState | null;
    transferredHost: boolean;
    newHostId: string | null;
  } {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { room: null, transferredHost: false, newHostId: null };
    }

    const outcome = engineLeaveRoom(room, playerId);
    if (!outcome.room) {
      this.deleteRoom(code);
      return outcome;
    }

    if (outcome.room.players.every((p) => !p.connected)) {
      this.scheduleCleanupTimer(code);
    }

    return outcome;
  }

  public disconnectSocket(socketId: string): {
    room: RoomState;
    player: PlayerRecord;
    allDisconnected: boolean;
  } | null {
    for (const [code, room] of this.rooms.entries()) {
      const outcome = engineDisconnectPlayer(room, socketId);
      if (outcome.player) {
        if (outcome.allDisconnected) {
          this.scheduleCleanupTimer(code);
        }
        return {
          room,
          player: outcome.player,
          allDisconnected: outcome.allDisconnected,
        };
      }
    }
    return null;
  }

  public reattachBySessionToken(
    sessionToken: string,
    newSocketId: string
  ): { room: RoomState; player: PlayerRecord } | null {
    for (const [code, room] of this.rooms.entries()) {
      const player = engineReattachPlayer(room, sessionToken, newSocketId);
      if (player) {
        this.cancelCleanupTimer(code);
        return { room, player };
      }
    }
    return null;
  }

  public findBySessionToken(
    sessionToken: string
  ): { room: RoomState; player: PlayerRecord } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find((p) => p.sessionToken === sessionToken);
      if (player) {
        return { room, player };
      }
    }
    return null;
  }

  public findBySocketId(
    socketId: string
  ): { room: RoomState; player: PlayerRecord } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find((p) => p.socketId === socketId);
      if (player) {
        return { room, player };
      }
    }
    return null;
  }

  public scheduleCleanupTimer(
    roomCode: string,
    timeoutMs: number = ROOM_CLEANUP_TIMEOUT_MS
  ): void {
    this.cancelCleanupTimer(roomCode);
    const timer = setTimeout(() => {
      this.deleteRoom(roomCode);
    }, timeoutMs);
    this.cleanupTimers.set(roomCode, timer);
  }

  public cancelCleanupTimer(roomCode: string): void {
    const existing = this.cleanupTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      this.cleanupTimers.delete(roomCode);
    }
  }

  public deleteRoom(roomCode: string): void {
    this.cancelCleanupTimer(roomCode);
    this.rooms.delete(roomCode);
  }

  public clearAll(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.rooms.clear();
  }
}
