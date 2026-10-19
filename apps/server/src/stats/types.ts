export interface VerifiedUser {
  uid: string;
  name?: string;
}

export interface TokenVerifier {
  verify(idToken: string): Promise<VerifiedUser>;
}

export interface UserStats {
  displayName: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  wins: number;
  gamesPlayed: number;
  winRate: number;
}

export interface StatsStore {
  ensureUser(uid: string, initialDisplayName?: string): Promise<UserStats>;
  recordGame(
    uid: string,
    gameId: string,
    won: boolean
  ): Promise<{ gamesPlayed: number; wins: number }>;
  getStats(uid: string): Promise<UserStats | null>;
  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  setDisplayName(uid: string, name: string): Promise<UserStats>;
  deleteUser(uid: string): Promise<void>;
}

export function calculateWinRate(wins: number, gamesPlayed: number): number {
  if (gamesPlayed <= 0) return 0;
  return Math.round((wins / gamesPlayed) * 1000) / 1000;
}
