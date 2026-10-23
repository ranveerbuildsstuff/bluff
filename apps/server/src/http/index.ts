import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  LeaderboardEntry,
  LeaderboardCache,
  StatsStore,
  TokenVerifier,
  VerifiedUser,
} from '../stats/index.js';
import { UpdateNameBodySchema } from '@bluff/shared';

export interface HttpOptions {
  statsStore: StatsStore;
  tokenVerifier: TokenVerifier;
  accountsEnabled: boolean;
  leaderboardCache?: LeaderboardCache;
}

export const LeaderboardQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).default(20),
  })
  .strict();

export interface AuthenticatedRequest extends Request {
  user?: VerifiedUser;
}

// In-memory per-IP rate limiter (e.g. 60 requests per minute per IP)
export function createIpRateLimiter(maxRequests = 60, windowMs = 60_000) {
  const ipRequests = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = ipRequests.get(ip);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      ipRequests.set(ip, record);
    }

    record.count++;
    if (record.count > maxRequests) {
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later',
      });
    }

    next();
  };
}

export function createApiRouter(options: HttpOptions): Router {
  const router = Router();
  const cache = options.leaderboardCache ?? new LeaderboardCache(120_000);

  // Authentication middleware
  const requireAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!options.accountsEnabled) {
      return res.status(503).json({ code: 'ACCOUNTS_DISABLED' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 'AUTH_FAILED' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ code: 'AUTH_FAILED' });
    }

    try {
      const verified = await options.tokenVerifier.verify(token);
      req.user = verified;
      next();
    } catch {
      return res.status(401).json({ code: 'AUTH_FAILED' });
    }
  };

  // GET /api/leaderboard?limit=20 (public)
  router.get('/leaderboard', async (req: Request, res: Response) => {
    const parseResult = LeaderboardQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ code: 'INVALID_REQUEST' });
    }

    if (!options.accountsEnabled) {
      return res.json([]);
    }

    const limit = parseResult.data.limit;
    try {
      const entries = await cache.get(limit, (fetchLimit) =>
        options.statsStore.getLeaderboard(fetchLimit)
      );
      // Ensure no uid or email in any response and displayName is clean (<= 16 chars)
      const sanitized: LeaderboardEntry[] = entries.map((e) => ({
        rank: e.rank,
        displayName: (e.displayName?.trim() || 'Player').slice(0, 16),
        wins: e.wins,
        gamesPlayed: e.gamesPlayed,
        winRate: e.winRate,
      }));
      return res.json(sanitized);
    } catch {
      return res.json([]);
    }
  });

  // GET /api/me (authenticated)
  router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await options.statsStore.ensureUser(
        req.user!.uid,
        req.user!.name
      );
      return res.json({
        displayName: (user.displayName?.trim() || 'Player').slice(0, 16),
        gamesPlayed: user.gamesPlayed,
        wins: user.wins,
        winRate: user.winRate,
      });
    } catch {
      return res.status(503).json({ code: 'ACCOUNTS_DISABLED' });
    }
  });

  // PATCH /api/me (authenticated)
  router.patch('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = UpdateNameBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: parseResult.error.issues[0]?.message || 'Invalid name',
      });
    }

    try {
      const updated = await options.statsStore.setDisplayName(
        req.user!.uid,
        parseResult.data.name
      );
      return res.json({
        displayName: (updated.displayName?.trim() || 'Player').slice(0, 16),
        gamesPlayed: updated.gamesPlayed,
        wins: updated.wins,
        winRate: updated.winRate,
      });
    } catch {
      return res.status(503).json({ code: 'ACCOUNTS_DISABLED' });
    }
  });

  // DELETE /api/me (authenticated)
  router.delete('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await options.statsStore.deleteUser(req.user!.uid);
      return res.json({ ok: true });
    } catch {
      return res.status(503).json({ code: 'ACCOUNTS_DISABLED' });
    }
  });

  return router;
}
