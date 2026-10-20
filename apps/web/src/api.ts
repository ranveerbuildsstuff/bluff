import {
  MeResponse,
  MeResponseSchema,
  LeaderboardEntry,
  LeaderboardEntrySchema,
  UpdateNameBodySchema,
} from '@bluff/shared';
import { z } from 'zod';

const LeaderboardResponseSchema = z.array(LeaderboardEntrySchema);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function getMe(idToken: string): Promise<MeResponse> {
  const res = await fetch('/api/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.error || `Failed to fetch profile (${res.status})`
    );
  }

  const data = await res.json();
  const parsed = MeResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid response from server');
  }
  return parsed.data;
}

export async function updateMyName(idToken: string, name: string): Promise<MeResponse> {
  const bodyResult = UpdateNameBodySchema.safeParse({ name });
  if (!bodyResult.success) {
    throw new Error(bodyResult.error.issues[0]?.message || 'Invalid player name');
  }

  const res = await fetch('/api/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(bodyResult.data),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.error || `Failed to update name (${res.status})`
    );
  }

  const data = await res.json();
  const parsed = MeResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid response from server');
  }
  return parsed.data;
}

export async function deleteMyStats(idToken: string): Promise<void> {
  const res = await fetch('/api/me', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.error || `Failed to delete stats (${res.status})`
    );
  }
}

export async function getLeaderboard(limit: number = 20): Promise<LeaderboardEntry[]> {
  const res = await fetch(`/api/leaderboard?limit=${limit}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.error || `Failed to load leaderboard (${res.status})`
    );
  }

  const data = await res.json();
  const parsed = LeaderboardResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid leaderboard response from server');
  }
  return parsed.data;
}
