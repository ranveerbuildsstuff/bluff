import { z } from 'zod';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 8;

export const SUITS = ['H', 'D', 'C', 'S'] as const;
export const SuitSchema = z.enum(SUITS);
export type Suit = z.infer<typeof SuitSchema>;

export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;
export const RankSchema = z.enum(RANKS);
export type Rank = z.infer<typeof RankSchema>;

export const CardSchema = z
  .object({
    id: z.string(),
    suit: SuitSchema,
    rank: RankSchema,
  })
  .strict();
export type Card = z.infer<typeof CardSchema>;

export const PileEntrySchema = z
  .object({
    playSeq: z.number().int().nonnegative(),
    playerId: z.string().uuid(),
    cards: z.array(CardSchema),
    declaredRank: RankSchema,
    count: z.number().int().positive(),
  })
  .strict();
export type PileEntry = z.infer<typeof PileEntrySchema>;

export const PlayerSchema = z
  .object({
    playerId: z.string().uuid(),
    name: z.string().min(1).max(16),
    hand: z.array(CardSchema),
  })
  .strict();
export type Player = z.infer<typeof PlayerSchema>;

export const RoomSettingsSchema = z
  .object({
    cardsPerPlayer: z.number().int(),
  })
  .strict();
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const RoomStatusSchema = z.enum([
  'LOBBY',
  'PLAYING',
  'FINAL_CALL',
  'PAUSED',
  'GAME_OVER',
]);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;

export const GameStateSchema = z
  .object({
    roomCode: z.string(),
    hostId: z.string().uuid(),
    status: RoomStatusSchema,
    settings: RoomSettingsSchema,
    players: z.array(PlayerSchema),
    turnOrder: z.array(z.string().uuid()),
    currentTurnId: z.string().uuid(),
    requiredRank: RankSchema,
    centralPile: z.array(PileEntrySchema),
    playSeq: z.number().int().nonnegative(),
    winnerId: z.string().uuid().optional(),
  })
  .strict();
export type GameState = z.infer<typeof GameStateSchema>;

// Public / Security View Schemas
export const PublicPlayerViewSchema = z
  .object({
    playerId: z.string().uuid(),
    name: z.string().min(1).max(16),
    connected: z.boolean(),
    handCount: z.number().int().nonnegative(),
  })
  .strict();
export type PublicPlayerView = z.infer<typeof PublicPlayerViewSchema>;

export const PublicLastPlayViewSchema = z
  .object({
    playSeq: z.number().int().nonnegative(),
    playerId: z.string().uuid(),
    declaredRank: RankSchema,
    count: z.number().int().positive(),
  })
  .strict();
export type PublicLastPlayView = z.infer<typeof PublicLastPlayViewSchema>;

export const PublicPileViewSchema = z
  .object({
    count: z.number().int().nonnegative(),
    lastPlay: PublicLastPlayViewSchema.nullable(),
  })
  .strict();
export type PublicPileView = z.infer<typeof PublicPileViewSchema>;

export const PublicGameStateSchema = z
  .object({
    roomCode: z.string(),
    hostId: z.string().uuid(),
    status: RoomStatusSchema,
    settings: RoomSettingsSchema,
    players: z.array(PublicPlayerViewSchema),
    myHand: z.array(CardSchema),
    turnOrder: z.array(z.string().uuid()),
    currentTurnId: z.string().uuid(),
    requiredRank: RankSchema,
    pile: PublicPileViewSchema,
    playSeq: z.number().int().nonnegative(),
    winnerId: z.string().uuid().optional(),
    serverNow: z.number(),
  })
  .strict();
export type PublicGameState = z.infer<typeof PublicGameStateSchema>;

// Room & Lobby Schemas
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
    settings: RoomSettingsSchema,
  })
  .strict();
export type RoomView = z.infer<typeof RoomViewSchema>;

export const UpdateSettingsRequestSchema = z
  .object({
    cardsPerPlayer: z.number().int(),
  })
  .strict();
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

export const StartGameRequestSchema = z.object({}).strict();
export type StartGameRequest = z.infer<typeof StartGameRequestSchema>;

export const SettingsClampedSchema = z
  .object({
    cardsPerPlayer: z.number().int(),
  })
  .strict();
export type SettingsClamped = z.infer<typeof SettingsClampedSchema>;

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
  UPDATE_SETTINGS: 'update_settings',
  START_GAME: 'start_game',
} as const;

export const SERVER_EVENTS = {
  SESSION_ISSUED: 'session_issued',
  ROOM_VIEW: 'room_view',
  ERROR: 'error',
  SETTINGS_CLAMPED: 'settings_clamped',
  GAME_STATE: 'game_state',
} as const;

// Helper calculations
export function maxCardsPerPlayer(playerCount: number): number {
  if (playerCount <= 0) return 15;
  return Math.min(15, Math.floor(52 / playerCount));
}

export function recommendedCardsPerPlayer(playerCount: number): number {
  if (playerCount <= 3) return 10;
  if (playerCount <= 5) return 7;
  return 5;
}

const RANK_ORDER: Record<Rank, number> = {
  A: 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
  '9': 8,
  '10': 9,
  J: 10,
  Q: 11,
  K: 12,
};

const SUIT_ORDER: Record<Suit, number> = {
  H: 0,
  D: 1,
  C: 2,
  S: 3,
};

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const rankDiff = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    if (rankDiff !== 0) return rankDiff;
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}
