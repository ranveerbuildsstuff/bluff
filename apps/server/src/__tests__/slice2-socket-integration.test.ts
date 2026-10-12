import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  PublicGameState,
  SessionIssued,
  RoomView,
} from '@bluff/shared';
import { RoomManager } from '../room-manager.js';
import { setupSocketServer } from '../socket/index.js';

describe('Slice 2: Socket Integration & Privacy Wire Checks', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let roomManager: RoomManager;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    ioServer = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
    });
    roomManager = new RoomManager();
    setupSocketServer(ioServer, roomManager);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    ioServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    roomManager.clearAll();
  });

  function createClient(sessionToken?: string): ClientSocket {
    return ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: sessionToken ? { sessionToken } : {},
    });
  }

  it('handles update_settings, settings_clamped on join, and emits hidden state on start_game', async () => {
    const clientHost = createClient();
    const clientGuest = createClient();

    let hostSession: SessionIssued | null = null;
    let guestSession: SessionIssued | null = null;

    // 1. Host creates room
    await new Promise<void>((resolve) => {
      clientHost.on(SERVER_EVENTS.SESSION_ISSUED, (data) => {
        hostSession = data;
        resolve();
      });
      clientHost.emit(CLIENT_EVENTS.CREATE_ROOM, { playerName: 'HostAlice' });
    });

    expect(hostSession).not.toBeNull();
    const roomCode = hostSession!.roomCode;

    // 2. Guest joins room
    await new Promise<void>((resolve) => {
      clientGuest.on(SERVER_EVENTS.SESSION_ISSUED, (data) => {
        guestSession = data;
        resolve();
      });
      clientGuest.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode, playerName: 'GuestBob' });
    });

    expect(guestSession).not.toBeNull();

    // 3. Host updates settings to 7 cards
    await new Promise<void>((resolve) => {
      clientHost.on(SERVER_EVENTS.ROOM_VIEW, (view: RoomView) => {
        if (view.settings.cardsPerPlayer === 7) {
          resolve();
        }
      });
      clientHost.emit(CLIENT_EVENTS.UPDATE_SETTINGS, { cardsPerPlayer: 7 });
    });

    // 4. Non-host attempts to update settings -> receives error
    await new Promise<void>((resolve) => {
      clientGuest.on(SERVER_EVENTS.ERROR, (err: { code: string }) => {
        expect(err.code).toBe('NOT_HOST');
        resolve();
      });
      clientGuest.emit(CLIENT_EVENTS.UPDATE_SETTINGS, { cardsPerPlayer: 5 });
    });

    // 5. Host starts game
    let hostGameState: PublicGameState | null = null;
    let guestGameState: PublicGameState | null = null;

    await Promise.all([
      new Promise<void>((resolve) => {
        clientHost.on(SERVER_EVENTS.GAME_STATE, (state: PublicGameState) => {
          hostGameState = state;
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        clientGuest.on(SERVER_EVENTS.GAME_STATE, (state: PublicGameState) => {
          guestGameState = state;
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        clientHost.emit(CLIENT_EVENTS.START_GAME, {});
        resolve();
      }),
    ]);

    expect(hostGameState).not.toBeNull();
    expect(guestGameState).not.toBeNull();

    // Both get 7 cards
    expect(hostGameState!.myHand).toHaveLength(7);
    expect(guestGameState!.myHand).toHaveLength(7);

    // Host's game state wire inspection
    const hostWireJson = JSON.stringify(hostGameState);
    for (const guestCard of guestGameState!.myHand) {
      expect(hostWireJson).not.toContain(`"${guestCard.id}"`);
    }

    // Guest's game state wire inspection
    const guestWireJson = JSON.stringify(guestGameState);
    for (const hostCard of hostGameState!.myHand) {
      expect(guestWireJson).not.toContain(`"${hostCard.id}"`);
    }

    clientHost.disconnect();
    clientGuest.disconnect();
  });
});
