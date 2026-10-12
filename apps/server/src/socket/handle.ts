import { z } from 'zod';
import { SERVER_EVENTS } from '@bluff/shared';

export interface SocketEmitter {
  emit: (event: string, payload: unknown) => unknown;
}

export function handle<T extends z.ZodTypeAny>(
  emitter: SocketEmitter,
  schema: T,
  fn: (data: z.infer<T>) => void | Promise<void>
): (rawPayload: unknown) => void {
  return (rawPayload: unknown) => {
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
