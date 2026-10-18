import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  GetRoomViewRequestSchema,
  LeaveRoomRequestSchema,
  UpdateSettingsRequestSchema,
  StartGameRequestSchema,
  PlayTurnRequestSchema,
  CallBluffRequestSchema,
  PlayAgainRequestSchema,
} from '@bluff/shared';
import { handle, clearRateLimit } from './handle.js';
import { RoomManager } from '../room-manager.js';
import { toRoomView } from '../engine/room.js';
import { toPublicState } from '../engine/game.js';

export function emitGameState(
  io: SocketIOServer,
  roomManager: RoomManager,
  roomCode: string
): void {
  const room = roomManager.getRoom(roomCode);
  if (!room || !room.gameState) return;

  const connectedMap: Record<string, boolean> = {};
  for (const p of room.players) {
    connectedMap[p.playerId] = p.connected;
  }

  const now = Date.now();
  for (const player of room.players) {
    if (player.socketId) {
      const publicState = toPublicState(
        room.gameState,
        player.playerId,
        connectedMap,
        now
      );
      io.to(player.socketId).emit(SERVER_EVENTS.GAME_STATE, publicState);
    }
  }
}

const roomQueues = new Map<string, Promise<unknown>>();

export function enqueueRoomAction<T>(roomCode: string, action: () => Promise<T> | T): Promise<T> {
  const code = roomCode.toUpperCase();
  const currentQueue = roomQueues.get(code) ?? Promise.resolve();
  const next = currentQueue.then(() => action()).finally(() => {
    if (roomQueues.get(code) === next) {
      roomQueues.delete(code);
    }
  });
  roomQueues.set(code, next);
  return next as Promise<T>;
}

export function setupSocketServer(io: SocketIOServer, roomManager: RoomManager): void {
  roomManager.setActionQueue(enqueueRoomAction);

  roomManager.setOnRoomChange((room) => {
    if (room) {
      io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(room));
      if (room.gameState) {
        emitGameState(io, roomManager, room.roomCode);
      }
    }
  });

  io.on('connection', async (socket: Socket) => {
    const sessionToken = socket.handshake.auth?.sessionToken;
    if (typeof sessionToken === 'string' && sessionToken.length > 0) {
      const existing = roomManager.findBySessionToken(sessionToken);
      if (existing) {
        await enqueueRoomAction(existing.room.roomCode, () => {
          const reattached = roomManager.reattachBySessionToken(sessionToken, socket.id);
          if (reattached) {
            const { room, player, wasPaused } = reattached;
            socket.join(room.roomCode);
            socket.emit(SERVER_EVENTS.SESSION_ISSUED, {
              playerId: player.playerId,
              sessionToken: player.sessionToken,
              roomCode: room.roomCode,
            });

            if (wasPaused) {
              io.to(room.roomCode).emit(SERVER_EVENTS.PLAYER_RECONNECTED, {
                playerId: player.playerId,
                name: player.name,
              });
            }

            io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(room));

            if (room.status !== 'LOBBY' && room.gameState) {
              emitGameState(io, roomManager, room.roomCode);
            }
          }
        });
      }
    }

    socket.on(
      CLIENT_EVENTS.CREATE_ROOM,
      handle(socket, CreateRoomRequestSchema, (data) => {
        const { room, hostPlayer } = roomManager.createRoom(data.playerName, socket.id);
        socket.join(room.roomCode);
        socket.emit(SERVER_EVENTS.SESSION_ISSUED, {
          playerId: hostPlayer.playerId,
          sessionToken: hostPlayer.sessionToken,
          roomCode: room.roomCode,
        });
        io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(room));
      })
    );

    socket.on(
      CLIENT_EVENTS.JOIN_ROOM,
      handle(socket, JoinRoomRequestSchema, async (data) => {
        await enqueueRoomAction(data.roomCode, () => {
          const result = roomManager.joinRoom(data.roomCode, data.playerName, socket.id);
          if (!result.ok) {
            socket.emit(SERVER_EVENTS.ERROR, {
              code: result.code,
              message: result.message,
            });
            return;
          }

          const room = roomManager.getRoom(data.roomCode);
          if (!room) {
            socket.emit(SERVER_EVENTS.ERROR, {
              code: 'ROOM_NOT_FOUND',
              message: 'Room not found',
            });
            return;
          }

          socket.join(room.roomCode);
          socket.emit(SERVER_EVENTS.SESSION_ISSUED, {
            playerId: result.player.playerId,
            sessionToken: result.player.sessionToken,
            roomCode: room.roomCode,
          });

          if (result.clamped && result.clampedCardsPerPlayer !== undefined) {
            const hostPlayer = room.players.find((p) => p.playerId === room.hostId);
            if (hostPlayer?.socketId) {
              io.to(hostPlayer.socketId).emit(SERVER_EVENTS.SETTINGS_CLAMPED, {
                cardsPerPlayer: result.clampedCardsPerPlayer,
              });
            }
          }

          io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(room));
        });
      })
    );

    socket.on(
      CLIENT_EVENTS.UPDATE_SETTINGS,
      handle(socket, UpdateSettingsRequestSchema, async (data) => {
        const found =
          roomManager.findBySocketId(socket.id) ||
          (typeof socket.handshake.auth?.sessionToken === 'string'
            ? roomManager.findBySessionToken(socket.handshake.auth.sessionToken)
            : null);

        if (!found) {
          socket.emit(SERVER_EVENTS.ERROR, {
            code: 'NOT_IN_ROOM',
            message: 'Player is not in any room',
          });
          return;
        }

        await enqueueRoomAction(found.room.roomCode, () => {
          const result = roomManager.updateSettings(
            found.room.roomCode,
            found.player.playerId,
            data.cardsPerPlayer
          );

          if (!result.ok) {
            socket.emit(SERVER_EVENTS.ERROR, {
              code: result.code,
              message: result.message,
            });
            return;
          }

          io.to(found.room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(found.room));
        });
      })
    );

    socket.on(
      CLIENT_EVENTS.START_GAME,
      handle(socket, StartGameRequestSchema, async () => {
        const found =
          roomManager.findBySocketId(socket.id) ||
          (typeof socket.handshake.auth?.sessionToken === 'string'
            ? roomManager.findBySessionToken(socket.handshake.auth.sessionToken)
            : null);

        if (!found) {
          socket.emit(SERVER_EVENTS.ERROR, {
            code: 'NOT_IN_ROOM',
            message: 'Player is not in any room',
          });
          return;
        }

        await enqueueRoomAction(found.room.roomCode, () => {
          const result = roomManager.startGame(found.room.roomCode, found.player.playerId);
          if (!result.ok) {
            socket.emit(SERVER_EVENTS.ERROR, {
              code: result.code,
              message: result.message,
            });
            return;
          }

          io.to(found.room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(found.room));
          emitGameState(io, roomManager, found.room.roomCode);
        });
      })
    );

    socket.on(
      CLIENT_EVENTS.PLAY_TURN,
      handle(socket, PlayTurnRequestSchema, async (data) => {
        const found =
          roomManager.findBySocketId(socket.id) ||
          (typeof socket.handshake.auth?.sessionToken === 'string'
            ? roomManager.findBySessionToken(socket.handshake.auth.sessionToken)
            : null);

        if (!found) {
          socket.emit(SERVER_EVENTS.ERROR, {
            code: 'NOT_IN_ROOM',
            message: 'Player is not in any room',
          });
          return;
        }

        await enqueueRoomAction(found.room.roomCode, () => {
          const result = roomManager.playTurn(
            found.room.roomCode,
            found.player.playerId,
            data.selectedCardIds
          );

          if (!result.ok) {
            socket.emit(SERVER_EVENTS.ERROR, {
              code: result.code,
              message: result.message,
            });
            return;
          }

          io.to(found.room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(found.room));
          emitGameState(io, roomManager, found.room.roomCode);
        });
      })
    );

    socket.on(
      CLIENT_EVENTS.CALL_BLUFF,
      handle(socket, CallBluffRequestSchema, async (data) => {
        const found =
          roomManager.findBySocketId(socket.id) ||
          (typeof socket.handshake.auth?.sessionToken === 'string'
            ? roomManager.findBySessionToken(socket.handshake.auth.sessionToken)
            : null);

        if (!found) {
          socket.emit(SERVER_EVENTS.ERROR, {
            code: 'NOT_IN_ROOM',
            message: 'Player is not in any room',
          });
          return;
        }

        await enqueueRoomAction(found.room.roomCode, () => {
          const result = roomManager.callBluff(
            found.room.roomCode,
            found.player.playerId,
            data.playSeq
          );

          if (!result.ok) {
            socket.emit(SERVER_EVENTS.ERROR, {
              code: result.code,
              message: result.message,
            });
            return;
          }

          io.to(found.room.roomCode).emit(
            SERVER_EVENTS.CHALLENGE_RESULT,
            result.result
          );
          io.to(found.room.roomCode).emit(
            SERVER_EVENTS.ROOM_VIEW,
            toRoomView(found.room)
          );
          emitGameState(io, roomManager, found.room.roomCode);
        });
      })
    );

    socket.on(
      CLIENT_EVENTS.PLAY_AGAIN,
      handle(socket, PlayAgainRequestSchema, async () => {
        const found =
          roomManager.findBySocketId(socket.id) ||
          (typeof socket.handshake.auth?.sessionToken === 'string'
            ? roomManager.findBySessionToken(socket.handshake.auth.sessionToken)
            : null);

        if (!found) {
          socket.emit(SERVER_EVENTS.ERROR, {
            code: 'NOT_IN_ROOM',
            message: 'Player is not in any room',
          });
          return;
        }

        await enqueueRoomAction(found.room.roomCode, () => {
          const result = roomManager.playAgain(
            found.room.roomCode,
            found.player.playerId
          );

          if (!result.ok) {
            socket.emit(SERVER_EVENTS.ERROR, {
              code: result.code,
              message: result.message,
            });
            return;
          }

          io.to(found.room.roomCode).emit(
            SERVER_EVENTS.ROOM_VIEW,
            toRoomView(found.room)
          );
        });
      })
    );

    socket.on(
      CLIENT_EVENTS.GET_ROOM_VIEW,
      handle(socket, GetRoomViewRequestSchema, () => {
        const found =
          roomManager.findBySocketId(socket.id) ||
          (typeof socket.handshake.auth?.sessionToken === 'string'
            ? roomManager.findBySessionToken(socket.handshake.auth.sessionToken)
            : null);
        if (found) {
          socket.emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(found.room));
          if (found.room.status !== 'LOBBY' && found.room.gameState) {
            const connectedMap: Record<string, boolean> = {};
            for (const p of found.room.players) {
              connectedMap[p.playerId] = p.connected;
            }
            const publicState = toPublicState(
              found.room.gameState,
              found.player.playerId,
              connectedMap,
              Date.now()
            );
            socket.emit(SERVER_EVENTS.GAME_STATE, publicState);
          }
        } else {
          socket.emit(SERVER_EVENTS.ERROR, {
            code: 'NOT_IN_ROOM',
            message: 'Player is not in any room',
          });
        }
      })
    );

    socket.on(
      CLIENT_EVENTS.LEAVE_ROOM,
      handle(socket, LeaveRoomRequestSchema, async () => {
        const found =
          roomManager.findBySocketId(socket.id) ||
          (typeof socket.handshake.auth?.sessionToken === 'string'
            ? roomManager.findBySessionToken(socket.handshake.auth.sessionToken)
            : null);
        if (!found) {
          return;
        }

        const { room, player } = found;
        await enqueueRoomAction(room.roomCode, () => {
          socket.leave(room.roomCode);
          const outcome = roomManager.leaveRoom(room.roomCode, player.playerId);
          if (outcome.room) {
            io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(outcome.room));
            if (outcome.room.gameState) {
              emitGameState(io, roomManager, room.roomCode);
            }
          }
        });
      })
    );

    socket.on('disconnect', async () => {
      clearRateLimit(socket.id);
      const found = roomManager.findBySocketId(socket.id);
      if (found) {
        await enqueueRoomAction(found.room.roomCode, () => {
          const disconnected = roomManager.disconnectSocket(socket.id);
          if (disconnected) {
            const { room, player, paused, rejoinDeadline } = disconnected;

            if (rejoinDeadline && (paused || room.status === 'PAUSED')) {
              io.to(room.roomCode).emit(SERVER_EVENTS.PLAYER_DISCONNECTED, {
                playerId: player.playerId,
                name: player.name,
                rejoinDeadline,
              });
            }

            io.to(room.roomCode).emit(
              SERVER_EVENTS.ROOM_VIEW,
              toRoomView(room)
            );
            if (room.gameState) {
              emitGameState(io, roomManager, room.roomCode);
            }
          }
        });
      }
    });
  });
}
