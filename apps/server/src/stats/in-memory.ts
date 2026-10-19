import {
  calculateWinRate,
  LeaderboardEntry,
  StatsStore,
  TokenVerifier,
  UserStats,
  VerifiedUser,
} from './types.js';

export class InMemoryStatsStore implements StatsStore {
  private users = new Map<
    string,
    {
      displayName: string;
      gamesPlayed: number;
      wins: number;
      createdAt: number;
      updatedAt: number;
    }
  >();
  private games = new Map<string, Set<string>>(); // uid -> set of gameIds

  async ensureUser(uid: string, initialDisplayName?: string): Promise<UserStats> {
    let user = this.users.get(uid);
    if (!user) {
      const now = Date.now();
      const displayName = initialDisplayName?.trim() || 'Player';
      user = {
        displayName,
        gamesPlayed: 0,
        wins: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.users.set(uid, user);
    }
    return {
      displayName: user.displayName,
      gamesPlayed: user.gamesPlayed,
      wins: user.wins,
      winRate: calculateWinRate(user.wins, user.gamesPlayed),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async recordGame(
    uid: string,
    gameId: string,
    won: boolean
  ): Promise<{ gamesPlayed: number; wins: number }> {
    let userGames = this.games.get(uid);
    if (!userGames) {
      userGames = new Set();
      this.games.set(uid, userGames);
    }

    let user = this.users.get(uid);
    if (!user) {
      await this.ensureUser(uid);
      user = this.users.get(uid)!;
    }

    if (userGames.has(gameId)) {
      // Idempotency: marker exists, do not double count
      return { gamesPlayed: user.gamesPlayed, wins: user.wins };
    }

    userGames.add(gameId);
    user.gamesPlayed += 1;
    if (won) {
      user.wins += 1;
    }
    user.updatedAt = Date.now();
    return { gamesPlayed: user.gamesPlayed, wins: user.wins };
  }

  async getStats(uid: string): Promise<UserStats | null> {
    const user = this.users.get(uid);
    if (!user) return null;
    return {
      displayName: user.displayName,
      gamesPlayed: user.gamesPlayed,
      wins: user.wins,
      winRate: calculateWinRate(user.wins, user.gamesPlayed),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const entries = Array.from(this.users.values()).map((user) => ({
      displayName: user.displayName,
      wins: user.wins,
      gamesPlayed: user.gamesPlayed,
      winRate: calculateWinRate(user.wins, user.gamesPlayed),
    }));

    // Ordered by wins desc, then winRate desc, then displayName asc
    entries.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return a.displayName.localeCompare(b.displayName);
    });

    const sliced = entries.slice(0, limit);
    return sliced.map((entry, index) => ({
      rank: index + 1,
      displayName: entry.displayName,
      wins: entry.wins,
      gamesPlayed: entry.gamesPlayed,
      winRate: entry.winRate,
    }));
  }

  async setDisplayName(uid: string, name: string): Promise<UserStats> {
    let user = this.users.get(uid);
    if (!user) {
      await this.ensureUser(uid, name);
      user = this.users.get(uid)!;
    }
    user.displayName = name;
    user.updatedAt = Date.now();
    return {
      displayName: user.displayName,
      gamesPlayed: user.gamesPlayed,
      wins: user.wins,
      winRate: calculateWinRate(user.wins, user.gamesPlayed),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async deleteUser(uid: string): Promise<void> {
    this.users.delete(uid);
    this.games.delete(uid);
  }
}

export class FakeTokenVerifier implements TokenVerifier {
  private tokens = new Map<string, VerifiedUser>();

  setToken(idToken: string, user: VerifiedUser): void {
    this.tokens.set(idToken, user);
  }

  async verify(idToken: string): Promise<VerifiedUser> {
    const user = this.tokens.get(idToken);
    if (!user) {
      throw new Error('AUTH_FAILED');
    }
    return user;
  }
}
