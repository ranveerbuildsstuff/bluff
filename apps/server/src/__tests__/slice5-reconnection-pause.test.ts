import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomManager, Scheduler } from '../room-manager.js';
import {
  startGame,
  playTurn,
  callBluff,
  pauseGame,
  resumeGame,
  abandonGame,
  toPublicState,
} from '../engine/game.js';
import {
  updateSettings,
  disconnectPlayer,
  reattachPlayer,
} from '../engine/room.js';
import { FINAL_CALL_MS, REJOIN_GRACE_MS, ABANDONED_CLEANUP_MS } from '@bluff/shared';

describe('Slice 5: Reconnection, Pause, and Abandonment Logic', () => {
  let roomManager: RoomManager;
  let customScheduler: Scheduler;
  let scheduledTasks: Map<number, { fn: () => void; time: number }>;
  let currentTime: number;
  let nextTimerId: number;

  beforeEach(() => {
    currentTime = 100000;
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

  describe('Pure Engine Pause / Resume / Abandon', () => {
    const p1 = { playerId: '11111111-1111-4111-8111-111111111111', name: 'Alice' };
    const p2 = { playerId: '22222222-2222-4222-8222-222222222222', name: 'Bob' };

    it('pauses from PLAYING and records pausedFrom, rejoinDeadline, and sets status PAUSED', () => {
      const state = startGame({
        roomCode: 'PAUSE1',
        hostId: p1.playerId,
        players: [p1, p2],
        settings: { cardsPerPlayer: 3 },
      });

      const paused = pauseGame(state, 1000, 60000);
      expect(paused.status).toBe('PAUSED');
      expect(paused.pausedFrom).toBe('PLAYING');
      expect(paused.rejoinDeadline).toBe(61000);
      expect(paused.finalCallRemainingMs).toBeNull();
    });

    it('pauses from FINAL_CALL and preserves remaining time', () => {
      const state = startGame({
        roomCode: 'PAUSE2',
        hostId: p1.playerId,
        players: [p1, p2],
        settings: { cardsPerPlayer: 3 },
      });

      state.status = 'FINAL_CALL';
      state.finalCallDeadline = 10000; // 6 seconds left if now is 4000

      const paused = pauseGame(state, 4000, 60000);
      expect(paused.status).toBe('PAUSED');
      expect(paused.pausedFrom).toBe('FINAL_CALL');
      expect(paused.finalCallRemainingMs).toBe(6000);
      expect(paused.finalCallDeadline).toBeNull();
      expect(paused.rejoinDeadline).toBe(64000);
    });

    it('resumes to PLAYING when paused from PLAYING', () => {
      const state = startGame({
        roomCode: 'RES1',
        hostId: p1.playerId,
        players: [p1, p2],
        settings: { cardsPerPlayer: 3 },
      });

      const paused = pauseGame(state, 1000);
      const resumed = resumeGame(paused, 5000);

      expect(resumed.status).toBe('PLAYING');
      expect(resumed.finalCallDeadline).toBeNull();
      expect(resumed.rejoinDeadline).toBeNull();
    });

    it('resumes to FINAL_CALL preserving remaining time', () => {
      const state = startGame({
        roomCode: 'RES2',
        hostId: p1.playerId,
        players: [p1, p2],
        settings: { cardsPerPlayer: 3 },
      });

      state.status = 'FINAL_CALL';
      state.finalCallDeadline = 10000;

      const paused = pauseGame(state, 6000); // 4000ms left
      expect(paused.finalCallRemainingMs).toBe(4000);

      const resumed = resumeGame(paused, 20000);
      expect(resumed.status).toBe('FINAL_CALL');
      expect(resumed.finalCallDeadline).toBe(24000); // 20000 + 4000
    });

    it('rejects play_turn and call_bluff with GAME_PAUSED when status is PAUSED', () => {
      const state = startGame({
        roomCode: 'REJ1',
        hostId: p1.playerId,
        players: [p1, p2],
        settings: { cardsPerPlayer: 3 },
      });

      const paused = pauseGame(state, 1000);

      const playRes = playTurn(paused, paused.currentTurnId, [paused.players[0].hand[0].id]);
      expect(playRes.ok).toBe(false);
      if (!playRes.ok) {
        expect(playRes.code).toBe('GAME_PAUSED');
      }

      const bluffRes = callBluff(paused, p2.playerId, 0);
      expect(bluffRes.ok).toBe(false);
      if (!bluffRes.ok) {
        expect(bluffRes.code).toBe('GAME_PAUSED');
      }
    });

    it('abandonGame sets status GAME_OVER, endedReason PLAYER_ABANDONED, no winner', () => {
      const state = startGame({
        roomCode: 'ABAN1',
        hostId: p1.playerId,
        players: [p1, p2],
        settings: { cardsPerPlayer: 3 },
      });

      const abandoned = abandonGame(state, 'Bob');
      expect(abandoned.status).toBe('GAME_OVER');
      expect(abandoned.endedReason).toBe('PLAYER_ABANDONED');
      expect(abandoned.abandonedPlayerName).toBe('Bob');
      expect(abandoned.winnerId).toBeUndefined();
      expect(abandoned.finalCallDeadline).toBeNull();
      expect(abandoned.rejoinDeadline).toBeNull();
    });
  });

  describe('RoomManager Reconnection & Lifecycle', () => {
    it('disconnecting in PLAYING transitions to PAUSED with 60s grace timer', () => {
      const { room } = roomManager.createRoom('Alice', 'sock-a');
      const p2 = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-b');
      expect(p2.ok).toBe(true);
      if (!p2.ok) return;

      roomManager.startGame(room.roomCode, room.hostId);
      expect(room.status).toBe('PLAYING');

      // Bob disconnects mid-game
      const outcome = roomManager.disconnectSocket('sock-b');
      expect(outcome).not.toBeNull();
      expect(outcome!.paused).toBe(true);
      expect(room.status).toBe('PAUSED');
      expect(room.gameState?.status).toBe('PAUSED');
      expect(room.gameState?.pausedFrom).toBe('PLAYING');
      expect(p2.player.connected).toBe(false);

      // Rejoining after 30s resumes the game
      advanceTime(30000);
      const reattach = roomManager.reattachBySessionToken(p2.player.sessionToken, 'sock-b-new');
      expect(reattach).not.toBeNull();
      expect(reattach!.resumed).toBe(true);
      expect(room.status).toBe('PLAYING');
      expect(room.gameState?.status).toBe('PLAYING');
      expect(p2.player.connected).toBe(true);
    });

    it('disconnecting in FINAL_CALL preserves remaining time upon resume', () => {
      const { room } = roomManager.createRoom('Alice', 'sock-a');
      const p2 = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-b');
      expect(p2.ok).toBe(true);
      if (!p2.ok) return;

      roomManager.startGame(room.roomCode, room.hostId);
      room.status = 'FINAL_CALL';
      if (room.gameState) {
        room.gameState.status = 'FINAL_CALL';
        room.gameState.finalCallDeadline = Date.now() + 8000; // 8s left
      }
      roomManager.scheduleFinalCallTimer(room.roomCode, 8000);

      // Disconnect
      const outcome = roomManager.disconnectSocket('sock-b');
      expect(outcome).not.toBeNull();
      expect(room.status).toBe('PAUSED');
      expect(room.gameState?.pausedFrom).toBe('FINAL_CALL');
      expect(room.gameState?.finalCallRemainingMs).toBeGreaterThan(0);

      // Rejoin
      const reattach = roomManager.reattachBySessionToken(p2.player.sessionToken, 'sock-b-new');
      expect(reattach).not.toBeNull();
      expect(reattach!.resumed).toBe(true);
      expect(room.status).toBe('FINAL_CALL');
      expect(room.gameState?.status).toBe('FINAL_CALL');
      expect(room.gameState?.finalCallDeadline).toBeDefined();
    });

    it('with several players offline, stays PAUSED until all are back', () => {
      const { room } = roomManager.createRoom('Alice', 'sock-a');
      const p2 = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-b');
      const p3 = roomManager.joinRoom(room.roomCode, 'Charlie', 'sock-c');
      expect(p2.ok && p3.ok).toBe(true);
      if (!p2.ok || !p3.ok) return;

      roomManager.startGame(room.roomCode, room.hostId);

      // Bob disconnects
      roomManager.disconnectSocket('sock-b');
      expect(room.status).toBe('PAUSED');

      // Charlie also disconnects
      roomManager.disconnectSocket('sock-c');
      expect(room.status).toBe('PAUSED');

      // Bob rejoins first: Charlie is still offline, so stay PAUSED
      const bobReattach = roomManager.reattachBySessionToken(p2.player.sessionToken, 'sock-b-new');
      expect(bobReattach!.resumed).toBe(false);
      expect(room.status).toBe('PAUSED');

      // Charlie rejoins: all back, so resume!
      const charlieReattach = roomManager.reattachBySessionToken(p3.player.sessionToken, 'sock-c-new');
      expect(charlieReattach!.resumed).toBe(true);
      expect(room.status).toBe('PLAYING');
    });

    it('grace expiry marks GAME_OVER with PLAYER_ABANDONED and schedules 2 min deletion', () => {
      const onRoomChange = vi.fn();
      roomManager.setOnRoomChange(onRoomChange);

      const { room } = roomManager.createRoom('Alice', 'sock-a');
      const p2 = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-b');
      expect(p2.ok).toBe(true);
      if (!p2.ok) return;

      roomManager.startGame(room.roomCode, room.hostId);
      roomManager.disconnectSocket('sock-b');
      expect(room.status).toBe('PAUSED');

      // 59 seconds pass: still paused
      advanceTime(59000);
      expect(room.status).toBe('PAUSED');
      expect(onRoomChange).not.toHaveBeenCalled();

      // At 60 seconds: Bob did not return!
      advanceTime(1000);
      expect(room.status).toBe('GAME_OVER');
      expect(room.gameState?.endedReason).toBe('PLAYER_ABANDONED');
      expect(room.gameState?.winnerId).toBeUndefined();
      expect(onRoomChange).toHaveBeenCalled();

      // After 2 minutes: room is deleted
      advanceTime(ABANDONED_CLEANUP_MS);
      expect(roomManager.getRoom(room.roomCode)).toBeUndefined();
    });

    it('disconnect during GAME_OVER does not pause; play_again returns to LOBBY with 60s rule', () => {
      const { room } = roomManager.createRoom('Alice', 'sock-a');
      const p2 = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-b');
      expect(p2.ok).toBe(true);
      if (!p2.ok) return;

      roomManager.startGame(room.roomCode, room.hostId);
      room.status = 'GAME_OVER';
      if (room.gameState) room.gameState.status = 'GAME_OVER';

      // Bob disconnects in GAME_OVER
      const dcOutcome = roomManager.disconnectSocket('sock-b');
      expect(dcOutcome!.paused).toBe(false);
      expect(room.status).toBe('GAME_OVER');

      // Host triggers playAgain -> returns to LOBBY
      const againOutcome = roomManager.playAgain(room.roomCode, room.hostId);
      expect(againOutcome.ok).toBe(true);
      expect(room.status).toBe('LOBBY');

      // Since Bob was disconnected, the lobby 60s rule applies
      advanceTime(60000);
      // Bob is removed from lobby
      expect(room.players).toHaveLength(1);
      expect(room.players[0].name).toBe('Alice');
    });

    it('covers engine edge cases: player not found, uncallable states, and room disconnect misses', () => {
      const { room } = roomManager.createRoom('Alice', 'sock-a');
      const p2 = roomManager.joinRoom(room.roomCode, 'Bob', 'sock-b');
      expect(p2.ok).toBe(true);
      roomManager.startGame(room.roomCode, room.hostId);

      const gameState = room.gameState!;

      // playTurn with unknown player ID (who matches currentTurnId)
      const ghostState = { ...gameState, currentTurnId: 'ghost-player-id' };
      const invalidPlay = playTurn(ghostState, 'ghost-player-id', [gameState.players[0].hand[0].id]);
      expect(invalidPlay.ok).toBe(false);
      if (!invalidPlay.ok) {
        expect(invalidPlay.code).toBe('PLAYER_NOT_FOUND');
      }

      // callBluff when game is GAME_OVER and pile has cards
      const gameOverState = {
        ...gameState,
        status: 'GAME_OVER' as const,
        centralPile: [{ playSeq: 1, playerId: gameState.players[0].playerId, declaredRank: 'A' as const, cards: [gameState.players[0].hand[0]] }],
      };
      const uncallableCall = callBluff(gameOverState, gameState.players[1].playerId, 1);
      expect(uncallableCall.ok).toBe(false);
      if (!uncallableCall.ok) {
        expect(uncallableCall.code).toBe('GAME_NOT_IN_CALLABLE_STATE');
      }

      // callBluff with unknown challenger ID
      const playingWithPileState = {
        ...gameState,
        centralPile: [{ playSeq: 1, playerId: gameState.players[0].playerId, declaredRank: 'A' as const, cards: [gameState.players[0].hand[0]] }],
      };
      const invalidChallenger = callBluff(playingWithPileState, 'non-existent-challenger-id', 1);
      expect(invalidChallenger.ok).toBe(false);
      if (!invalidChallenger.ok) {
        expect(invalidChallenger.code).toBe('PLAYER_NOT_FOUND');
      }

      // updateSettings when not in LOBBY (by host)
      const settingsResult = updateSettings(room, room.hostId, 4);
      expect(settingsResult.ok).toBe(false);
      if (!settingsResult.ok) {
        expect(settingsResult.code).toBe('NOT_IN_LOBBY');
      }

      // disconnectPlayer when socketId not found in room
      const dcResult = disconnectPlayer(room, 'unknown-socket');
      expect(dcResult.player).toBeNull();

      // reattachPlayer when sessionToken not found in room
      const reattachResult = reattachPlayer(room, 'unknown-session-token', 'new-sock');
      expect(reattachResult).toBeNull();
    });
  });
});
