import { LeaderboardEntry, StatsStore, TokenVerifier, UserStats, VerifiedUser } from './types.js';

export class NoopStatsStore implements StatsStore {
  async ensureUser(): Promise<UserStats> {
    throw new Error('ACCOUNTS_DISABLED');
  }

  async recordGame(): Promise<{ gamesPlayed: number; wins: number }> {
    throw new Error('ACCOUNTS_DISABLED');
  }

  async getStats(): Promise<UserStats | null> {
    return null;
  }

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    return [];
  }

  async setDisplayName(): Promise<UserStats> {
    throw new Error('ACCOUNTS_DISABLED');
  }

  async deleteUser(): Promise<void> {
    throw new Error('ACCOUNTS_DISABLED');
  }
}

export class NoopTokenVerifier implements TokenVerifier {
  async verify(_idToken: string): Promise<VerifiedUser> {
    throw new Error('AUTH_FAILED');
  }
}
