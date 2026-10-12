import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { handle } from '../socket/handle.js';
import { SERVER_EVENTS } from '@bluff/shared';

describe('Socket handle wrapper', () => {
  it('calls handler with parsed data when payload is valid', () => {
    const schema = z.object({
      name: z.string().min(2),
    }).strict();

    const mockSocket = {
      emit: vi.fn(),
    };

    const handlerFn = vi.fn();
    const wrapped = handle(mockSocket, schema, handlerFn);

    wrapped({ name: 'ValidName' });

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(handlerFn).toHaveBeenCalledWith({ name: 'ValidName' });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads without invoking the handler and emits error event', () => {
    const schema = z.object({
      playerName: z.string().min(1).max(16),
    }).strict();

    const mockSocket = {
      emit: vi.fn(),
    };

    const handlerFn = vi.fn();
    const wrapped = handle(mockSocket, schema, handlerFn);

    // Invalid payload 1: wrong field type
    wrapped({ playerName: 123 });
    expect(handlerFn).not.toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, {
      code: 'INVALID_PAYLOAD',
      message: expect.stringContaining('Expected string'),
    });

    // Invalid payload 2: extra field not allowed by strict schema
    mockSocket.emit.mockClear();
    wrapped({ playerName: 'Bob', unauthorizedField: 'hack' });
    expect(handlerFn).not.toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, {
      code: 'INVALID_PAYLOAD',
      message: expect.stringContaining('Unrecognized key'),
    });

    // Invalid payload 3: null / non-object
    mockSocket.emit.mockClear();
    wrapped(null);
    expect(handlerFn).not.toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, {
      code: 'INVALID_PAYLOAD',
      message: expect.any(String),
    });
  });

  it('catches handler runtime exceptions and emits internal error', () => {
    const schema = z.object({ test: z.boolean() }).strict();
    const mockSocket = { emit: vi.fn() };
    const handlerFn = vi.fn().mockImplementation(() => {
      throw new Error('Something broke');
    });

    const wrapped = handle(mockSocket, schema, handlerFn);
    wrapped({ test: true });

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, {
      code: 'INTERNAL_ERROR',
      message: 'Something broke',
    });
  });
});
