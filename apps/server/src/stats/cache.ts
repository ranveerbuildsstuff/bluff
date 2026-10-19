import { LeaderboardEntry } from './types.js';

export class LeaderboardCache {
  private cachedData: LeaderboardEntry[] | null = null;
  private cachedAt = 0;
  private cachedLimit = 0;

  constructor(private ttlMs: number = 120_000) {}

  async get(
    limit: number,
    fetcher: (fetchLimit: number) => Promise<LeaderboardEntry[]>
  ): Promise<LeaderboardEntry[]> {
    const now = Date.now();
    if (
      this.cachedData &&
      now - this.cachedAt < this.ttlMs &&
      this.cachedLimit >= limit
    ) {
      return this.cachedData.slice(0, limit);
    }

    const fresh = await fetcher(limit);
    this.cachedData = fresh;
    this.cachedAt = now;
    this.cachedLimit = limit;
    return fresh;
  }

  clear(): void {
    this.cachedData = null;
    this.cachedAt = 0;
    this.cachedLimit = 0;
  }
}
