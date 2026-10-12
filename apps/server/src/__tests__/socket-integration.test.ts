import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SessionIssued,
  RoomView,
  ErrorEvent,
} from '@bluff/shared';
import { RoomManager } from '../room-manager.js';
import { setupSocketServer } from '../socket/index.js';

describe('Socket.io Lobby Integration', () => {
  let server: http.Server;
  let port: number;
  let serverUrl: string;
  let ioServer: SocketIOServer;
  let roomManager: RoomManager;

  beforeAll(async () => {
    const app = express();
    server = http.createServer(app);
    ioServer = new SocketIOServer(server, {
      cors: { origin: '*' },
    });
    roomManager = new RoomManager();
    setupSocketServer(ioServer, roomManager);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
          serverUrl = `http://localhost:${port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    ioServer.close();
    server.close();
  });

  it('handles create room, join room, error on bad code, reconnect, and host transfer', async () => {
    // 1. Client 1 connects and creates room
    const client1: ClientSocket = ClientIO(serverUrl, { autoConnect: true });

    const [c1Session, c1RoomView] = await new Promise<[SessionIssued, RoomView]>((resolve) => {
      let session: SessionIssued | null = null;
      let roomView: RoomView | null = null;

      client1.on(SERVER_EVENTS.SESSION_ISSUED, (data: SessionIssued) => {
        session = data;
        if (session && roomView) resolve([session, roomView]);
      });

      client1.on(SERVER_EVENTS.ROOM_VIEW, (data: RoomView) => {
        roomView = data;
        if (session && roomView) resolve([session, roomView]);
      });

      client1.on('connect', () => {
        client1.emit(CLIENT_EVENTS.CREATE_ROOM, { playerName: 'Alice' });
      });
    });

    expect(c1Session.roomCode).toHaveLength(6);
    expect(c1RoomView.players).toHaveLength(1);
    expect(c1RoomView.players[0].name).toBe('Alice');
    expect(c1RoomView.hostId).toBe(c1Session.playerId);

    const roomCode = c1Session.roomCode;

    // 2. Client 2 tries non-existent room code with valid characters
    const client2: ClientSocket = ClientIO(serverUrl, { autoConnect: true });

    const notFoundError = await new Promise<ErrorEvent>((resolve) => {
      client2.on(SERVER_EVENTS.ERROR, (err: ErrorEvent) => {
        resolve(err);
      });
      client2.on('connect', () => {
        client2.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode: 'ZZZZZZ', playerName: 'Bob' });
      });
    });

    expect(notFoundError.code).toBe('ROOM_NOT_FOUND');

    // Also verify invalid characters code returns INVALID_PAYLOAD
    const invalidCharError = await new Promise<ErrorEvent>((resolve) => {
      client2.once(SERVER_EVENTS.ERROR, (err: ErrorEvent) => {
        resolve(err);
      });
      // 'BADCOD' contains 'O' which is invalid in the alphabet
      client2.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode: 'BADCOD', playerName: 'Bob' });
    });

    expect(invalidCharError.code).toBe('INVALID_PAYLOAD');

    // 3. Client 2 joins with valid room code
    const [c2Session, c2RoomView] = await new Promise<[SessionIssued, RoomView]>((resolve) => {
      let session: SessionIssued | null = null;
      let roomView: RoomView | null = null;

      client2.on(SERVER_EVENTS.SESSION_ISSUED, (data: SessionIssued) => {
        session = data;
        if (session && roomView) resolve([session, roomView]);
      });

      client2.on(SERVER_EVENTS.ROOM_VIEW, (data: RoomView) => {
        roomView = data;
        if (session && roomView) resolve([session, roomView]);
      });

      client2.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode, playerName: 'Bob' });
    });

    expect(c2Session.roomCode).toBe(roomCode);
    expect(c2RoomView.players).toHaveLength(2);
    expect(c2RoomView.players[1].name).toBe('Bob');

    // Also Client 1 should have received updated RoomView with 2 players
    const c1UpdatedView = await new Promise<RoomView>((resolve) => {
      client1.once(SERVER_EVENTS.ROOM_VIEW, (view: RoomView) => {
        resolve(view);
      });
      // trigger get_room_view to be sure
      client1.emit(CLIENT_EVENTS.GET_ROOM_VIEW, {});
    });
    expect(c1UpdatedView.players).toHaveLength(2);

    // 4. Client 1 disconnects and reconnects using sessionToken in auth
    client1.disconnect();

    const client1Rejoin: ClientSocket = ClientIO(serverUrl, {
      auth: { sessionToken: c1Session.sessionToken },
      autoConnect: true,
    });

    const rejoinedView = await new Promise<RoomView>((resolve) => {
      client1Rejoin.on(SERVER_EVENTS.ROOM_VIEW, (view: RoomView) => {
        resolve(view);
      });
    });

    expect(rejoinedView.roomCode).toBe(roomCode);
    const aliceInView = rejoinedView.players.find((p) => p.playerId === c1Session.playerId);
    expect(aliceInView).toBeDefined();
    expect(aliceInView?.connected).toBe(true);

    // 5. Client 1 leaves room: host transfers to Client 2 (Bob)
    const hostTransferredPromise = new Promise<RoomView>((resolve) => {
      client2.on(SERVER_EVENTS.ROOM_VIEW, (view: RoomView) => {
        if (view.hostId === c2Session.playerId) {
          resolve(view);
        }
      });
    });

    client1Rejoin.emit(CLIENT_EVENTS.LEAVE_ROOM, {});

    const viewAfterLeave = await hostTransferredPromise;
    expect(viewAfterLeave.players).toHaveLength(1);
    expect(viewAfterLeave.players[0].name).toBe('Bob');
    expect(viewAfterLeave.hostId).toBe(c2Session.playerId);

    client1Rejoin.disconnect();
    client2.disconnect();
  });
});
