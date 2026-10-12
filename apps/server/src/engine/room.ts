import {
  MAX_ROOM_PLAYERS,
  RoomStatus,
  RoomView,
} from '@bluff/shared';
import { createPlayerId, createSessionToken } from './identity.js';

export interface PlayerRecord {
  playerId: string;
  sessionToken: string;
  name: string;
  connected: boolean;
  socketId: string | null;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  players: PlayerRecord[];
}

export type JoinRoomResult =
  | { ok: true; player: PlayerRecord }
  | { ok: false; code: 'ROOM_NOT_IN_LOBBY' | 'ROOM_FULL'; message: string };

export function createRoom(
  roomCode: string,
  hostPlayerName: string,
  socketId: string | null = null
): { room: RoomState; hostPlayer: PlayerRecord } {
  const hostPlayer: PlayerRecord = {
    playerId: createPlayerId(),
    sessionToken: createSessionToken(),
    name: hostPlayerName.trim(),
    connected: true,
    socketId,
  };

  const room: RoomState = {
    roomCode,
    hostId: hostPlayer.playerId,
    status: 'LOBBY',
    players: [hostPlayer],
  };

  return { room, hostPlayer };
}

export function joinRoom(
  room: RoomState,
  playerName: string,
  socketId: string | null = null
): JoinRoomResult {
  if (room.status !== 'LOBBY') {
    return {
      ok: false,
      code: 'ROOM_NOT_IN_LOBBY',
      message: 'Cannot join: game has already started',
    };
  }

  if (room.players.length >= MAX_ROOM_PLAYERS) {
    return {
      ok: false,
      code: 'ROOM_FULL',
      message: `Room is full (max ${MAX_ROOM_PLAYERS} players)`,
    };
  }

  const player: PlayerRecord = {
    playerId: createPlayerId(),
    sessionToken: createSessionToken(),
    name: playerName.trim(),
    connected: true,
    socketId,
  };

  room.players.push(player);

  return { ok: true, player };
}

export function leaveRoom(
  room: RoomState,
  playerId: string
): {
  room: RoomState | null;
  transferredHost: boolean;
  newHostId: string | null;
} {
  const index = room.players.findIndex((p) => p.playerId === playerId);
  if (index === -1) {
    return {
      room,
      transferredHost: false,
      newHostId: room.hostId,
    };
  }

  const wasHost = room.hostId === playerId;
  room.players.splice(index, 1);

  if (room.players.length === 0) {
    return {
      room: null,
      transferredHost: false,
      newHostId: null,
    };
  }

  if (wasHost) {
    room.hostId = room.players[0].playerId;
    return {
      room,
      transferredHost: true,
      newHostId: room.hostId,
    };
  }

  return {
    room,
    transferredHost: false,
    newHostId: room.hostId,
  };
}

export function disconnectPlayer(
  room: RoomState,
  socketId: string
): {
  player: PlayerRecord | null;
  allDisconnected: boolean;
} {
  const player = room.players.find((p) => p.socketId === socketId);
  if (!player) {
    return { player: null, allDisconnected: room.players.every((p) => !p.connected) };
  }

  player.connected = false;
  player.socketId = null;

  return {
    player,
    allDisconnected: room.players.every((p) => !p.connected),
  };
}

export function reattachPlayer(
  room: RoomState,
  sessionToken: string,
  newSocketId: string
): PlayerRecord | null {
  const player = room.players.find((p) => p.sessionToken === sessionToken);
  if (!player) {
    return null;
  }

  player.connected = true;
  player.socketId = newSocketId;
  return player;
}

export function toRoomView(room: RoomState): RoomView {
  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      connected: p.connected,
    })),
  };
}
