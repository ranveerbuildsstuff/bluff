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
import {
  startGame as engineStartGame,
  playTurn as enginePlayTurn,
  callBluff as engineCallBluff,
  pauseGame,
  resumeGame,
  abandonGame,
  PlayTurnResult,
  CallBluffResult,
} from './engine/game.js';
import { generateUniqueRoomCode } from './engine/room-code.js';
import {
  GameState,
  maxCardsPerPlayer,
  FINAL_CALL_MS,
  REJOIN_GRACE_MS,
  ABANDONED_CLEANUP_MS,
  StatsUpdatedEvent,
} from '@bluff/shared';
import {
  StatsStore,
  NoopStatsStore,
  VerifiedUser,
  getMinRankedPlayers,
} from './stats/index.js';

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
export type ActionQueueFn = <T>(roomCode: string, action: () => Promise<T> | T) => Promise<T>;
export type StatsUpdatedCallback = (
  playerId: string,
  socketId: string | null,
  event: StatsUpdatedEvent
) => void;

export class RoomManager {
  private rooms = new Map<string, RoomState>();
  private cleanupTimers = new Map<string, unknown>();
  private playerDisconnectTimers = new Map<string, unknown>();
  private playerGraceDeadlines = new Map<string, number>();
  private finalCallTimers = new Map<string, unknown>();
  private onRoomChange?: RoomChangeCallback;
  private actionQueue?: ActionQueueFn;
  private onStatsUpdated?: StatsUpdatedCallback;

  constructor(
    private scheduler: Scheduler = defaultScheduler,
    onRoomChange?: RoomChangeCallback,
    private statsStore: StatsStore = new NoopStatsStore(),
    private minRankedPlayers: number = getMinRankedPlayers()
  ) {
    this.onRoomChange = onRoomChange;
  }

  public setOnStatsUpdated(callback: StatsUpdatedCallback): void {
    this.onStatsUpdated = callback;
  }

  public setStatsStore(store: StatsStore): void {
    this.statsStore = store;
  }

  public setMinRankedPlayers(count: number): void {
    this.minRankedPlayers = count;
  }

  private notifyStatsUpdated(player: PlayerRecord, event: StatsUpdatedEvent): void {
    if (this.onStatsUpdated) {
      this.onStatsUpdated(player.playerId, player.socketId, event);
    }
  }

  public setActionQueue(queue: ActionQueueFn): void {
    this.actionQueue = queue;
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

  public playTurn(
    roomCode: string,
    playerId: string,
    cardIds: readonly string[]
  ):
    | PlayTurnResult
    | {
        ok: false;
        code: 'ROOM_NOT_FOUND' | 'NO_ACTIVE_GAME';
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

    if (!room.gameState) {
      return {
        ok: false,
        code: 'NO_ACTIVE_GAME',
        message: 'No active game in this room',
      };
    }

    const result = enginePlayTurn(room.gameState, playerId, cardIds);
    if (result.ok) {
      if (result.state.status === 'FINAL_CALL') {
        const deadline = Date.now() + FINAL_CALL_MS;
        result.state.finalCallDeadline = deadline;
        this.scheduleFinalCallTimer(code, FINAL_CALL_MS);
      } else {
        this.cancelFinalCallTimer(code);
      }
      room.gameState = result.state;
      room.status = result.state.status;
    }

    return result;
  }

  public async callBluff(
    roomCode: string,
    challengerId: string,
    playSeq: number
  ): Promise<
    | CallBluffResult
    | {
        ok: false;
        code: 'ROOM_NOT_FOUND' | 'NO_ACTIVE_GAME';
        message: string;
      }
  > {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        message: `Room "${code}" does not exist`,
      };
    }

    if (!room.gameState) {
      return {
        ok: false,
        code: 'NO_ACTIVE_GAME',
        message: 'No active game in this room',
      };
    }

    const result = engineCallBluff(room.gameState, challengerId, playSeq);
    if (result.ok) {
      this.cancelFinalCallTimer(code);
      room.gameState = result.state;
      room.status = result.state.status;
      if (result.state.status === 'GAME_OVER') {
        await this.handleGameOver(room);
      }
    }

    return result;
  }

  public playAgain(
    roomCode: string,
    requesterPlayerId: string
  ):
    | { ok: true; room: RoomState }
    | {
        ok: false;
        code: 'ROOM_NOT_FOUND' | 'NOT_HOST' | 'GAME_NOT_OVER';
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
        message: 'Only the host can start a new game',
      };
    }

    if (room.status !== 'GAME_OVER') {
      return {
        ok: false,
        code: 'GAME_NOT_OVER',
        message: 'Cannot play again until the game is over',
      };
    }

    this.cancelFinalCallTimer(code);
    room.status = 'LOBBY';
    room.gameState = null;

    // Apply 60s disconnect timer for any players currently offline when returning to lobby
    for (const player of room.players) {
      if (!player.connected) {
        this.schedulePlayerDisconnectTimer(code, player.playerId);
      }
    }

    return { ok: true, room };
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
    paused: boolean;
    rejoinDeadline?: number;
  } | null {
    for (const [code, room] of this.rooms.entries()) {
      const outcome = engineDisconnectPlayer(room, socketId);
      if (outcome.player) {
        const player = outcome.player;
        let paused = false;
        let rejoinDeadline: number | undefined;

        if (room.status === 'LOBBY') {
          this.schedulePlayerDisconnectTimer(code, player.playerId);
        } else if (room.status === 'PLAYING' || room.status === 'FINAL_CALL') {
          paused = true;
          this.cancelFinalCallTimer(code);
          const now = Date.now();
          if (room.gameState) {
            room.gameState = pauseGame(room.gameState, now, REJOIN_GRACE_MS);
            rejoinDeadline = room.gameState.rejoinDeadline ?? undefined;
          }
          room.status = 'PAUSED';
          this.scheduleGameGraceTimer(code, player.playerId, REJOIN_GRACE_MS);
        } else if (room.status === 'PAUSED') {
          const now = Date.now();
          rejoinDeadline = now + REJOIN_GRACE_MS;
          this.scheduleGameGraceTimer(code, player.playerId, REJOIN_GRACE_MS);
        }

        if (outcome.allDisconnected) {
          this.scheduleCleanupTimer(code);
        }

        return {
          room,
          player,
          allDisconnected: outcome.allDisconnected,
          paused,
          rejoinDeadline,
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
      this.playerGraceDeadlines.delete(playerId);
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

  public scheduleGameGraceTimer(
    roomCode: string,
    playerId: string,
    timeoutMs: number = REJOIN_GRACE_MS
  ): void {
    this.cancelPlayerDisconnectTimer(playerId);
    const deadline = Date.now() + timeoutMs;
    this.playerGraceDeadlines.set(playerId, deadline);

    const timer = this.scheduler.setTimeout(() => {
      const run = () => this.handleGraceTimeout(roomCode, playerId);
      if (this.actionQueue) {
        this.actionQueue(roomCode, run);
      } else {
        run();
      }
    }, timeoutMs);
    this.playerDisconnectTimers.set(playerId, timer);
  }

  public async handleGraceTimeout(roomCode: string, playerId: string): Promise<void> {
    const code = roomCode.toUpperCase();
    this.playerDisconnectTimers.delete(playerId);
    this.playerGraceDeadlines.delete(playerId);
    const room = this.rooms.get(code);
    if (!room) return;

    const player = room.players.find((p) => p.playerId === playerId);
    if (player && !player.connected && room.status === 'PAUSED') {
      const abandonedName = player.name;
      if (room.gameState) {
        room.gameState = abandonGame(room.gameState, abandonedName);
      }
      room.status = 'GAME_OVER';

      for (const p of room.players) {
        this.cancelPlayerDisconnectTimer(p.playerId);
      }
      this.cancelFinalCallTimer(code);

      // Delete room after 2 minutes on abandonment
      this.scheduleCleanupTimer(code, ABANDONED_CLEANUP_MS);

      if (this.onRoomChange) {
        this.onRoomChange(room, code);
      }

      await this.handleGameOver(room);
    }
  }

  public cancelPlayerDisconnectTimer(playerId: string): void {
    const existing = this.playerDisconnectTimers.get(playerId);
    if (existing) {
      this.scheduler.clearTimeout(existing);
      this.playerDisconnectTimers.delete(playerId);
    }
    this.playerGraceDeadlines.delete(playerId);
  }

  public reattachBySessionToken(
    sessionToken: string,
    newSocketId: string
  ): {
    room: RoomState;
    player: PlayerRecord;
    resumed: boolean;
    wasPaused: boolean;
  } | null {
    for (const [code, room] of this.rooms.entries()) {
      const player = engineReattachPlayer(room, sessionToken, newSocketId);
      if (player) {
        this.cancelPlayerDisconnectTimer(player.playerId);
        this.cancelCleanupTimer(code);

        let resumed = false;
        let wasPaused = false;

        if (room.status === 'PAUSED' || room.gameState?.status === 'PAUSED') {
          wasPaused = true;
          const remainingDisconnected = room.players.filter((p) => !p.connected);
          if (remainingDisconnected.length > 0) {
            let earliestDeadline: number | null = null;
            for (const dp of remainingDisconnected) {
              const d = this.playerGraceDeadlines.get(dp.playerId);
              if (d && (earliestDeadline === null || d < earliestDeadline)) {
                earliestDeadline = d;
              }
            }
            if (room.gameState && earliestDeadline) {
              room.gameState.rejoinDeadline = earliestDeadline;
            }
            resumed = false;
          } else {
            resumed = true;
            if (room.gameState) {
              room.gameState = resumeGame(room.gameState, Date.now());
              room.status = room.gameState.status;

              if (room.status === 'FINAL_CALL' && room.gameState.finalCallDeadline) {
                const remainingMs = Math.max(0, room.gameState.finalCallDeadline - Date.now());
                this.scheduleFinalCallTimer(code, remainingMs);
              }
            }
          }
        }

        return { room, player, resumed, wasPaused };
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

  public scheduleFinalCallTimer(
    roomCode: string,
    timeoutMs: number = FINAL_CALL_MS
  ): void {
    this.cancelFinalCallTimer(roomCode);
    const timer = this.scheduler.setTimeout(() => {
      const run = () => this.handleFinalCallTimeout(roomCode);
      if (this.actionQueue) {
        this.actionQueue(roomCode, run);
      } else {
        run();
      }
    }, timeoutMs);
    this.finalCallTimers.set(roomCode.toUpperCase(), timer);
  }

  public cancelFinalCallTimer(roomCode: string): void {
    const code = roomCode.toUpperCase();
    const existing = this.finalCallTimers.get(code);
    if (existing) {
      this.scheduler.clearTimeout(existing);
      this.finalCallTimers.delete(code);
    }
  }

  public async handleFinalCallTimeout(roomCode: string): Promise<void> {
    const code = roomCode.toUpperCase();
    this.finalCallTimers.delete(code);
    const room = this.rooms.get(code);
    if (room && room.gameState && room.gameState.status === 'FINAL_CALL') {
      room.gameState.status = 'GAME_OVER';
      room.status = 'GAME_OVER';
      room.gameState.finalCallDeadline = null;
      if (this.onRoomChange) {
        this.onRoomChange(room, code);
      }
      await this.handleGameOver(room);
    }
  }

  public async handleGameOver(room: RoomState): Promise<void> {
    if (!room.gameState) {
      return;
    }

    const gameState = room.gameState;
    if (typeof gameState.gameId !== 'string') {
      return;
    }
    const gameId = gameState.gameId;
    const isAbandoned =
      gameState.endedReason === 'PLAYER_ABANDONED' || !gameState.winnerId;
    const playerCount = gameState.turnOrder.length;
    const ranked =
      !isAbandoned &&
      !!gameState.winnerId &&
      playerCount >= this.minRankedPlayers;

    const finalResult = {
      gameId,
      winnerId: gameState.winnerId,
      playerIds: [...gameState.turnOrder],
      ranked,
      endedReason: gameState.endedReason ?? undefined,
    };
    room.finalResult = finalResult;

    for (const player of room.players) {
      if (!player.uid || !finalResult.playerIds.includes(player.playerId)) {
        continue;
      }

      if (ranked) {
        const won = gameState.winnerId === player.playerId;
        try {
          const rec = await this.statsStore.recordGame(
            player.uid,
            finalResult.gameId,
            won
          );
          this.notifyStatsUpdated(player, {
            gamesPlayed: rec.gamesPlayed,
            wins: rec.wins,
            counted: true,
          });
        } catch {
          // Ignore
        }
      } else {
        const reason =
          gameState.endedReason === 'PLAYER_ABANDONED'
            ? 'ABANDONED'
            : 'NOT_RANKED';
        try {
          const curr = await this.statsStore.getStats(player.uid);
          this.notifyStatsUpdated(player, {
            gamesPlayed: curr?.gamesPlayed ?? 0,
            wins: curr?.wins ?? 0,
            counted: false,
            reason,
          });
        } catch {
          this.notifyStatsUpdated(player, {
            gamesPlayed: 0,
            wins: 0,
            counted: false,
            reason,
          });
        }
      }
    }
  }

  public async identifyPlayer(
    roomCode: string,
    playerId: string,
    verified: VerifiedUser
  ): Promise<
    | {
        ok: true;
        displayName: string;
        stats: { gamesPlayed: number; wins: number };
      }
    | { ok: false; code: 'AUTH_FAILED'; message: string }
  > {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return {
        ok: false,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      };
    }

    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) {
      return {
        ok: false,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      };
    }

    // A uid may be linked to only ONE player per room (reject a second link)
    const existingOther = room.players.find(
      (p) => p.uid === verified.uid && p.playerId !== playerId
    );
    if (existingOther) {
      return {
        ok: false,
        code: 'AUTH_FAILED',
        message: 'Account is already linked to another player in this room',
      };
    }

    player.uid = verified.uid;
    const initialDisplayName = verified.name || player.name;

    try {
      const user = await this.statsStore.ensureUser(
        verified.uid,
        initialDisplayName
      );

      // Late claim: if a guest signs in (identify) while the room is in GAME_OVER
      // and they were a player in the finished game, credit that one game (once, via marker)
      const finalResult = room.finalResult;
      if (
        room.status === 'GAME_OVER' &&
        finalResult &&
        finalResult.playerIds.includes(player.playerId)
      ) {
        if (finalResult.ranked) {
          const won = finalResult.winnerId === player.playerId;
          const rec = await this.statsStore.recordGame(
            verified.uid,
            finalResult.gameId,
            won
          );
          user.gamesPlayed = rec.gamesPlayed;
          user.wins = rec.wins;
          this.notifyStatsUpdated(player, {
            gamesPlayed: rec.gamesPlayed,
            wins: rec.wins,
            counted: true,
          });
        } else {
          const reason =
            finalResult.endedReason === 'PLAYER_ABANDONED'
              ? 'ABANDONED'
              : 'NOT_RANKED';
          this.notifyStatsUpdated(player, {
            gamesPlayed: user.gamesPlayed,
            wins: user.wins,
            counted: false,
            reason,
          });
        }
      }

      return {
        ok: true,
        displayName: user.displayName,
        stats: {
          gamesPlayed: user.gamesPlayed,
          wins: user.wins,
        },
      };
    } catch {
      return {
        ok: false,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      };
    }
  }

  public signOutPlayer(roomCode: string, playerId: string): void {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.playerId === playerId);
    if (player) {
      player.uid = undefined;
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
    this.cancelFinalCallTimer(code);
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
    for (const timer of this.finalCallTimers.values()) {
      this.scheduler.clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.playerDisconnectTimers.clear();
    this.playerGraceDeadlines.clear();
    this.finalCallTimers.clear();
    this.rooms.clear();
  }
}
