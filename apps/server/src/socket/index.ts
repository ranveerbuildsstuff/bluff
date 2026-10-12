import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  GetRoomViewRequestSchema,
  LeaveRoomRequestSchema,
} from '@bluff/shared';
import { handle } from './handle.js';
import { RoomManager } from '../room-manager.js';
import { toRoomView } from '../engine/room.js';

export function setupSocketServer(io: SocketIOServer, roomManager: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    const sessionToken = socket.handshake.auth?.sessionToken;
    if (typeof sessionToken === 'string' && sessionToken.length > 0) {
      const reattached = roomManager.reattachBySessionToken(sessionToken, socket.id);
      if (reattached) {
        const { room, player } = reattached;
        socket.join(room.roomCode);
        socket.emit(SERVER_EVENTS.SESSION_ISSUED, {
          playerId: player.playerId,
          sessionToken: player.sessionToken,
          roomCode: room.roomCode,
        });
        io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(room));
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
      handle(socket, JoinRoomRequestSchema, (data) => {
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
        io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(room));
      })
    );

    socket.on(
      CLIENT_EVENTS.GET_ROOM_VIEW,
      handle(socket, GetRoomViewRequestSchema, () => {
        const found = roomManager.findBySocketId(socket.id);
        if (found) {
          socket.emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(found.room));
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
      handle(socket, LeaveRoomRequestSchema, () => {
        const found = roomManager.findBySocketId(socket.id);
        if (!found) {
          return;
        }

        const { room, player } = found;
        socket.leave(room.roomCode);
        const outcome = roomManager.leaveRoom(room.roomCode, player.playerId);
        if (outcome.room) {
          io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_VIEW, toRoomView(outcome.room));
        }
      })
    );

    socket.on('disconnect', () => {
      const disconnected = roomManager.disconnectSocket(socket.id);
      if (disconnected) {
        io.to(disconnected.room.roomCode).emit(
          SERVER_EVENTS.ROOM_VIEW,
          toRoomView(disconnected.room)
        );
      }
    });
  });
}
