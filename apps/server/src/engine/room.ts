import {
  MAX_ROOM_PLAYERS,
  RoomStatus,
  RoomView,
  GameState,
  maxCardsPerPlayer,
  recommendedCardsPerPlayer,
} from '@bluff/shared';
import { createPlayerId, createSessionToken } from './identity.js';

export interface PlayerRecord {
  playerId: string;
  sessionToken: string;
  name: string;
  connected: boolean;
  socketId: string | null;
  uid?: string;
}

export interface FinalGameResult {
  gameId: string;
  winnerId?: string;
  playerIds: string[];
  ranked: boolean;
  endedReason?: string;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  players: PlayerRecord[];
  settings: {
    cardsPerPlayer: number;
  };
  cardsPerPlayerSource: 'auto' | 'host';
  gameState?: GameState | null;
  finalResult?: FinalGameResult | null;
}

export type JoinRoomResult =
  | {
      ok: true;
      player: PlayerRecord;
      clamped: boolean;
      clampedCardsPerPlayer?: number;
    }
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
    settings: {
      cardsPerPlayer: recommendedCardsPerPlayer(1),
    },
    cardsPerPlayerSource: 'auto',
    gameState: null,
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

  const newPlayerCount = room.players.length;
  let clamped = false;
  let clampedCardsPerPlayer: number | undefined;

  if (room.cardsPerPlayerSource === 'auto') {
    room.settings.cardsPerPlayer = recommendedCardsPerPlayer(newPlayerCount);
  } else {
    const max = maxCardsPerPlayer(newPlayerCount);
    if (room.settings.cardsPerPlayer > max) {
      room.settings.cardsPerPlayer = max;
      clamped = true;
      clampedCardsPerPlayer = max;
    }
  }

  return {
    ok: true,
    player,
    clamped,
    clampedCardsPerPlayer,
  };
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

  if (room.status === 'LOBBY' && room.cardsPerPlayerSource === 'auto') {
    room.settings.cardsPerPlayer = recommendedCardsPerPlayer(room.players.length);
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

export type UpdateSettingsResult =
  | { ok: true; settings: { cardsPerPlayer: number } }
  | {
      ok: false;
      code: 'NOT_HOST' | 'NOT_IN_LOBBY' | 'INVALID_CARDS_PER_PLAYER';
      message: string;
    };

export function updateSettings(
  room: RoomState,
  requesterPlayerId: string,
  cardsPerPlayer: number
): UpdateSettingsResult {
  if (room.hostId !== requesterPlayerId) {
    return {
      ok: false,
      code: 'NOT_HOST',
      message: 'Only the host can update room settings',
    };
  }

  if (room.status !== 'LOBBY') {
    return {
      ok: false,
      code: 'NOT_IN_LOBBY',
      message: 'Settings can only be changed in the lobby',
    };
  }

  const max = maxCardsPerPlayer(room.players.length);
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 3 || cardsPerPlayer > max) {
    return {
      ok: false,
      code: 'INVALID_CARDS_PER_PLAYER',
      message: `Cards per player must be an integer between 3 and ${max}`,
    };
  }

  room.settings.cardsPerPlayer = cardsPerPlayer;
  room.cardsPerPlayerSource = 'host';

  return {
    ok: true,
    settings: { cardsPerPlayer: room.settings.cardsPerPlayer },
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
    settings: {
      cardsPerPlayer: room.settings.cardsPerPlayer,
    },
  };
}
