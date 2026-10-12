import {
  RoomState,
  PlayerRecord,
  createRoom as engineCreateRoom,
  joinRoom as engineJoinRoom,
  leaveRoom as engineLeaveRoom,
  updateSettings as engineUpdateSettings,
  disconnectPlayer as engineDisconnectPlayer,
  reattachPlayer as engineReattachPlayer,
  JoinRoomResult,
  UpdateSettingsResult,
} from './engine/room.js';
import { startGame as engineStartGame } from './engine/game.js';
import { generateUniqueRoomCode } from './engine/room-code.js';
import { GameState, maxCardsPerPlayer } from '@bluff/shared';

export const ROOM_CLEANUP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const LOBBY_DISCONNECT_TIMEOUT_MS = 60 * 1000; // 60 seconds

export interface Scheduler {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as NodeJS.Timeout),
};

export type RoomChangeCallback = (room: RoomState | null, roomCode: string) => void;

export class RoomManager {
  private rooms = new Map<string, RoomState>();
  private cleanupTimers = new Map<string, unknown>();
  private playerDisconnectTimers = new Map<string, unknown>();
  private onRoomChange?: RoomChangeCallback;

  constructor(
    private scheduler: Scheduler = defaultScheduler,
    onRoomChange?: RoomChangeCallback
  ) {
    this.onRoomChange = onRoomChange;
  }

  public setOnRoomChange(callback: RoomChangeCallback): void {
    this.onRoomChange = callback;
  }

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

  public updateSettings(
    roomCode: string,
    requesterPlayerId: string,
    cardsPerPlayer: number
  ): UpdateSettingsResult | { ok: false; code: 'ROOM_NOT_FOUND'; message: string } {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        message: `Room "${code}" does not exist`,
      };
    }

    return engineUpdateSettings(room, requesterPlayerId, cardsPerPlayer);
  }

  public startGame(
    roomCode: string,
    requesterPlayerId: string,
    rng: () => number = Math.random
  ):
    | { ok: true; gameState: GameState; room: RoomState }
    | {
        ok: false;
        code:
          | 'ROOM_NOT_FOUND'
          | 'NOT_HOST'
          | 'NOT_IN_LOBBY'
          | 'NOT_ENOUGH_PLAYERS'
          | 'INVALID_CARDS_PER_PLAYER';
        message: string;
      } {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        message: `Room "${code}" does not exist`,
      };
    }

    if (room.hostId !== requesterPlayerId) {
      return {
        ok: false,
        code: 'NOT_HOST',
        message: 'Only the host can start the game',
      };
    }

    if (room.status !== 'LOBBY') {
      return {
        ok: false,
        code: 'NOT_IN_LOBBY',
        message: 'Game can only be started from the lobby',
      };
    }

    if (room.players.length < 2) {
      return {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        message: 'At least 2 players are required to start the game',
      };
    }

    const max = maxCardsPerPlayer(room.players.length);
    if (
      !Number.isInteger(room.settings.cardsPerPlayer) ||
      room.settings.cardsPerPlayer < 3 ||
      room.settings.cardsPerPlayer > max
    ) {
      return {
        ok: false,
        code: 'INVALID_CARDS_PER_PLAYER',
        message: `Invalid cards per player (${room.settings.cardsPerPlayer}). Must be between 3 and ${max}`,
      };
    }

    const gameState = engineStartGame(room, rng);
    room.status = 'PLAYING';
    room.gameState = gameState;

    return { ok: true, gameState, room };
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

    this.cancelPlayerDisconnectTimer(playerId);

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
        if (room.status === 'LOBBY') {
          this.schedulePlayerDisconnectTimer(code, outcome.player.playerId);
        }

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

  public schedulePlayerDisconnectTimer(
    roomCode: string,
    playerId: string,
    timeoutMs: number = LOBBY_DISCONNECT_TIMEOUT_MS
  ): void {
    this.cancelPlayerDisconnectTimer(playerId);
    const timer = this.scheduler.setTimeout(() => {
      this.playerDisconnectTimers.delete(playerId);
      const code = roomCode.toUpperCase();
      const room = this.rooms.get(code);
      if (!room) return;
      const player = room.players.find((p) => p.playerId === playerId);
      if (player && !player.connected && room.status === 'LOBBY') {
        const outcome = this.leaveRoom(code, playerId);
        if (this.onRoomChange) {
          this.onRoomChange(outcome.room, code);
        }
      }
    }, timeoutMs);
    this.playerDisconnectTimers.set(playerId, timer);
  }

  public cancelPlayerDisconnectTimer(playerId: string): void {
    const existing = this.playerDisconnectTimers.get(playerId);
    if (existing) {
      this.scheduler.clearTimeout(existing);
      this.playerDisconnectTimers.delete(playerId);
    }
  }

  public reattachBySessionToken(
    sessionToken: string,
    newSocketId: string
  ): { room: RoomState; player: PlayerRecord } | null {
    for (const [code, room] of this.rooms.entries()) {
      const player = engineReattachPlayer(room, sessionToken, newSocketId);
      if (player) {
        this.cancelPlayerDisconnectTimer(player.playerId);
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
    const timer = this.scheduler.setTimeout(() => {
      this.deleteRoom(roomCode);
    }, timeoutMs);
    this.cleanupTimers.set(roomCode, timer);
  }

  public cancelCleanupTimer(roomCode: string): void {
    const existing = this.cleanupTimers.get(roomCode);
    if (existing) {
      this.scheduler.clearTimeout(existing);
      this.cleanupTimers.delete(roomCode);
    }
  }

  public deleteRoom(roomCode: string): void {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (room) {
      for (const player of room.players) {
        this.cancelPlayerDisconnectTimer(player.playerId);
      }
    }
    this.cancelCleanupTimer(code);
    this.rooms.delete(code);
  }

  public clearAll(): void {
    for (const timer of this.cleanupTimers.values()) {
      this.scheduler.clearTimeout(timer);
    }
    for (const timer of this.playerDisconnectTimers.values()) {
      this.scheduler.clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.playerDisconnectTimers.clear();
    this.rooms.clear();
  }
}
