import { z } from 'zod';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_ROOM_PLAYERS = 8;

export const PlayerNameSchema = z
  .string()
  .trim()
  .min(1, 'Name must be at least 1 character')
  .max(16, 'Name cannot exceed 16 characters');

export const RoomCodeSchema = z
  .string()
  .trim()
  .length(ROOM_CODE_LENGTH, `Room code must be exactly ${ROOM_CODE_LENGTH} characters`)
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, 'Room code contains invalid characters');

export const RoomStatusSchema = z.enum([
  'LOBBY',
  'PLAYING',
  'FINAL_CALL',
  'PAUSED',
  'GAME_OVER',
]);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;

export const CreateRoomRequestSchema = z
  .object({
    playerName: PlayerNameSchema,
  })
  .strict();
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const JoinRoomRequestSchema = z
  .object({
    roomCode: RoomCodeSchema,
    playerName: PlayerNameSchema,
  })
  .strict();
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

export const SessionIssuedSchema = z
  .object({
    playerId: z.string().uuid(),
    sessionToken: z.string().min(1),
    roomCode: RoomCodeSchema,
  })
  .strict();
export type SessionIssued = z.infer<typeof SessionIssuedSchema>;

export const RoomPlayerSchema = z
  .object({
    playerId: z.string().uuid(),
    name: z.string().min(1).max(16),
    connected: z.boolean(),
  })
  .strict();
export type RoomPlayer = z.infer<typeof RoomPlayerSchema>;

export const RoomViewSchema = z
  .object({
    roomCode: RoomCodeSchema,
    hostId: z.string().uuid(),
    status: RoomStatusSchema,
    players: z.array(RoomPlayerSchema),
  })
  .strict();
export type RoomView = z.infer<typeof RoomViewSchema>;

export const ErrorEventSchema = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .strict();
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const GetRoomViewRequestSchema = z.object({}).strict();
export type GetRoomViewRequest = z.infer<typeof GetRoomViewRequestSchema>;

export const LeaveRoomRequestSchema = z.object({}).strict();
export type LeaveRoomRequest = z.infer<typeof LeaveRoomRequestSchema>;

// Socket Event Names
export const CLIENT_EVENTS = {
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  GET_ROOM_VIEW: 'get_room_view',
  LEAVE_ROOM: 'leave_room',
} as const;

export const SERVER_EVENTS = {
  SESSION_ISSUED: 'session_issued',
  ROOM_VIEW: 'room_view',
  ERROR: 'error',
} as const;
