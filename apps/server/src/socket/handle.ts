import { z } from 'zod';
import { SERVER_EVENTS } from '@bluff/shared';

export interface SocketEmitter {
  id?: string;
  emit: (event: string, payload: unknown) => unknown;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const BUCKET_CAPACITY = 10;
const REFILL_RATE_PER_MS = 10 / 1000; // ~10 events per second

const socketBuckets = new Map<string, TokenBucket>();

export function checkRateLimit(socketId: string, now: number = Date.now()): boolean {
  let bucket = socketBuckets.get(socketId);
  if (!bucket) {
    bucket = { tokens: BUCKET_CAPACITY - 1, lastRefill: now };
    socketBuckets.set(socketId, bucket);
    return true;
  }

  const elapsed = Math.max(0, now - bucket.lastRefill);
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsed * REFILL_RATE_PER_MS);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

export function clearRateLimit(socketId: string): void {
  socketBuckets.delete(socketId);
}

export function resetRateLimits(): void {
  socketBuckets.clear();
}

export function handle<T extends z.ZodTypeAny>(
  emitter: SocketEmitter,
  schema: T,
  fn: (data: z.infer<T>) => void | Promise<void>
): (rawPayload: unknown) => void {
  return (rawPayload: unknown) => {
    if (emitter.id && !checkRateLimit(emitter.id)) {
      emitter.emit(SERVER_EVENTS.ERROR, {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded. Please slow down.',
      });
      return;
    }

    const result = schema.safeParse(rawPayload);
    if (!result.success) {
      const issueMessages = result.error.issues.map((i) => i.message).join('; ');
      emitter.emit(SERVER_EVENTS.ERROR, {
        code: 'INVALID_PAYLOAD',
        message: issueMessages || 'Invalid request payload',
      });
      return;
    }

    try {
      const outcome = fn(result.data);
      if (outcome instanceof Promise) {
        outcome.catch((err: unknown) => {
          emitter.emit(SERVER_EVENTS.ERROR, {
            code: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : 'An error occurred',
          });
        });
      }
    } catch (err: unknown) {
      emitter.emit(SERVER_EVENTS.ERROR, {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'An error occurred',
      });
    }
  };
}
