/**
 * Slice 9: API contract tests.
 *
 * These tests call the real Express handlers (InMemoryStatsStore + FakeTokenVerifier)
 * and parse every response using the SAME shared Zod schemas that the web client
 * (apps/web/src/api.ts) uses.  If the server output ever drifts from the shared
 * schema, these tests will fail before any deploy.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import {
  MeResponseSchema,
  LeaderboardEntrySchema,
} from '@bluff/shared';
import { z } from 'zod';
import { createApp } from '../index.js';
import { InMemoryStatsStore, FakeTokenVerifier } from '../stats/index.js';

const LeaderboardArraySchema = z.array(LeaderboardEntrySchema);

// --- helpers ---------------------------------------------------------------

async function assertMeResponseConformsToSchema(
  baseUrl: string,
  token: string
): Promise<z.infer<typeof MeResponseSchema>> {
  const res = await fetch(`${baseUrl}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  const json = await res.json();
  const parsed = MeResponseSchema.safeParse(json);
  expect(
    parsed.success,
    `GET /api/me response did not match MeResponseSchema: ${
      !parsed.success ? JSON.stringify(parsed.error.issues) : ''
    }`
  ).toBe(true);
  return parsed.data!;
}

async function assertLeaderboardConformsToSchema(
  baseUrl: string
): Promise<z.infer<typeof LeaderboardArraySchema>> {
  const res = await fetch(`${baseUrl}/api/leaderboard?limit=20`);
  expect(res.status).toBe(200);
  const json = await res.json();
  const parsed = LeaderboardArraySchema.safeParse(json);
  expect(
    parsed.success,
    `GET /api/leaderboard response did not match LeaderboardEntrySchema[]: ${
      !parsed.success ? JSON.stringify(parsed.error.issues) : ''
    }`
  ).toBe(true);
  return parsed.data!;
}

// --- tests -----------------------------------------------------------------

describe('Slice 9: API contract tests (server output vs shared schema)', () => {
  let server: HttpServer;
  let baseUrl: string;
  let store: InMemoryStatsStore;
  let verifier: FakeTokenVerifier;

  beforeEach(async () => {
    store = new InMemoryStatsStore();
    verifier = new FakeTokenVerifier();

    const { app } = createApp({
      statsService: { enabled: true, store, verifier },
    });

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // -- GET /api/me -----------------------------------------------------------

  it('GET /api/me for a new signed-in user returns zeros + displayName, never an error', async () => {
    verifier.setToken('tok-alice', { uid: 'uid-alice', name: 'Alice' });

    const data = await assertMeResponseConformsToSchema(baseUrl, 'tok-alice');

    expect(data.displayName).toBe('Alice');
    expect(data.gamesPlayed).toBe(0);
    expect(data.wins).toBe(0);
    expect(data.winRate).toBe(0);
  });

  it('GET /api/me truncates displayName longer than 16 chars so MeResponseSchema never fails', async () => {
    // Google profile names can exceed 16 chars - this was bug 1
    verifier.setToken('tok-long', { uid: 'uid-long', name: 'Alexander Hamilton Jr.' });

    const data = await assertMeResponseConformsToSchema(baseUrl, 'tok-long');

    expect(data.displayName.length).toBeLessThanOrEqual(16);
    expect(data.displayName).toBe('Alexander Hamilt');
  });

  it('GET /api/me for signed-in user without name returns "Player" + zeros and passes schema', async () => {
    verifier.setToken('tok-noname', { uid: 'uid-noname' }); // no name property

    const data = await assertMeResponseConformsToSchema(baseUrl, 'tok-noname');

    expect(data.displayName).toBe('Player');
    expect(data.gamesPlayed).toBe(0);
    expect(data.wins).toBe(0);
    expect(data.winRate).toBe(0);
  });

  it('GET /api/me for existing user with recorded games parses correctly', async () => {
    verifier.setToken('tok-bob', { uid: 'uid-bob', name: 'Bob' });
    await store.ensureUser('uid-bob', 'Bob');
    await store.recordGame('uid-bob', 'game-1', true);
    await store.recordGame('uid-bob', 'game-2', false);

    const data = await assertMeResponseConformsToSchema(baseUrl, 'tok-bob');

    expect(data.displayName).toBe('Bob');
    expect(data.gamesPlayed).toBe(2);
    expect(data.wins).toBe(1);
    expect(data.winRate).toBeCloseTo(0.5, 3);
  });

  // -- PATCH /api/me ---------------------------------------------------------

  it('PATCH /api/me returns MeResponseSchema-valid body after name update', async () => {
    verifier.setToken('tok-alice', { uid: 'uid-alice', name: 'Alice' });
    await store.ensureUser('uid-alice', 'Alice');

    const res = await fetch(`${baseUrl}/api/me`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer tok-alice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'AliceNew' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = MeResponseSchema.safeParse(json);
    expect(
      parsed.success,
      `PATCH /api/me response did not match MeResponseSchema: ${
        !parsed.success ? JSON.stringify(parsed.error.issues) : ''
      }`
    ).toBe(true);
    expect(parsed.data!.displayName).toBe('AliceNew');
  });

  // -- DELETE /api/me --------------------------------------------------------

  it('DELETE /api/me returns { ok: true } and subsequent GET lazily re-creates user', async () => {
    verifier.setToken('tok-alice', { uid: 'uid-alice', name: 'Alice' });
    await store.ensureUser('uid-alice', 'Alice');
    await store.recordGame('uid-alice', 'game-1', true);

    const delRes = await fetch(`${baseUrl}/api/me`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer tok-alice' },
    });
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ ok: true });

    // After deletion, GET must still succeed (lazily re-creates) and conform to schema
    const data = await assertMeResponseConformsToSchema(baseUrl, 'tok-alice');
    expect(data.gamesPlayed).toBe(0);
    expect(data.wins).toBe(0);
  });

  // -- GET /api/leaderboard --------------------------------------------------

  it('GET /api/leaderboard entries all parse against LeaderboardEntrySchema', async () => {
    await store.ensureUser('u1', 'Zach');
    await store.recordGame('u1', 'g1', true);

    const entries = await assertLeaderboardConformsToSchema(baseUrl);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].displayName).toBe('Zach');
  });

  it('GET /api/leaderboard excludes users with 0 gamesPlayed (bug 2 regression)', async () => {
    // User who signed in but never played — must NOT appear
    await store.ensureUser('u-zero', 'ZeroGames');

    // User with 1 game — must appear
    await store.ensureUser('u-one', 'OneGame');
    await store.recordGame('u-one', 'g1', false);

    const entries = await assertLeaderboardConformsToSchema(baseUrl);

    const names = entries.map((e) => e.displayName);
    expect(names).not.toContain('ZeroGames');
    expect(names).toContain('OneGame');
  });

  it('GET /api/leaderboard returns empty array when no user has played', async () => {
    // Create a user with no games
    await store.ensureUser('u-zero', 'Nobody');

    const entries = await assertLeaderboardConformsToSchema(baseUrl);
    expect(entries).toEqual([]);
  });

  it('GET /api/leaderboard rank field starts at 1 and increments sequentially', async () => {
    for (let i = 1; i <= 3; i++) {
      await store.ensureUser(`u${i}`, `Player${i}`);
      for (let g = 0; g < i; g++) {
        await store.recordGame(`u${i}`, `g-${i}-${g}`, true);
      }
    }

    const entries = await assertLeaderboardConformsToSchema(baseUrl);
    expect(entries.length).toBe(3);
    entries.forEach((entry, idx) => {
      expect(entry.rank).toBe(idx + 1);
    });
  });

  it('all entries in leaderboard response have gamesPlayed >= 1', async () => {
    // Mix players: some have games, some do not
    for (let i = 1; i <= 6; i++) {
      await store.ensureUser(`player-${i}`, `P${i}`);
      if (i % 2 === 0) {
        await store.recordGame(`player-${i}`, `game-${i}`, i > 3);
      }
    }

    const entries = await assertLeaderboardConformsToSchema(baseUrl);
    for (const entry of entries) {
      expect(entry.gamesPlayed).toBeGreaterThanOrEqual(1);
    }
  });
});