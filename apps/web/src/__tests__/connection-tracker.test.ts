import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { setupConnectionTracker } from '../connection-tracker';
import { Socket } from 'socket.io-client';

class MockSocket extends EventEmitter {
  public connected: boolean;
  public io: EventEmitter;

  constructor(initialConnected = false) {
    super();
    this.connected = initialConnected;
    this.io = new EventEmitter();
  }
}

describe('Connection Status Tracker', () => {
  it('synchronizes immediately with socket.connected = true on mount', () => {
    const mockSocket = new MockSocket(true) as unknown as Socket;
    const listener = vi.fn();

    const cleanup = setupConnectionTracker(mockSocket, listener);

    expect(listener).toHaveBeenCalledWith(true);
    cleanup();
  });

  it('synchronizes immediately with socket.connected = false on mount', () => {
    const mockSocket = new MockSocket(false) as unknown as Socket;
    const listener = vi.fn();

    const cleanup = setupConnectionTracker(mockSocket, listener);

    expect(listener).toHaveBeenCalledWith(false);
    cleanup();
  });

  it('updates status when connect and disconnect events fire', () => {
    const mockSocket = new MockSocket(false) as unknown as Socket;
    const statuses: boolean[] = [];

    const cleanup = setupConnectionTracker(mockSocket, (status) => {
      statuses.push(status);
    });

    expect(statuses).toEqual([false]);

    // Socket connects
    (mockSocket as unknown as MockSocket).connected = true;
    mockSocket.emit('connect');
    expect(statuses).toEqual([false, true]);

    // Socket disconnects
    (mockSocket as unknown as MockSocket).connected = false;
    mockSocket.emit('disconnect');
    expect(statuses).toEqual([false, true, false]);

    cleanup();
  });

  it('updates status on connect_error and reconnection lifecycle events', () => {
    const mockSocket = new MockSocket(true) as unknown as Socket;
    const statuses: boolean[] = [];

    const cleanup = setupConnectionTracker(mockSocket, (status) => {
      statuses.push(status);
    });

    expect(statuses).toEqual([true]);

    // Connect error
    mockSocket.emit('connect_error');
    expect(statuses).toEqual([true, false]);

    // Manager starts reconnect attempt
    const mock = mockSocket as unknown as MockSocket;
    mock.io.emit('reconnect_attempt');
    expect(statuses).toEqual([true, false, false]);

    // Manager succeeds reconnect
    mock.connected = true;
    mock.io.emit('reconnect');
    expect(statuses).toEqual([true, false, false, true]);

    cleanup();
  });

  it('stops receiving updates after cleanup', () => {
    const mockSocket = new MockSocket(false) as unknown as Socket;
    const listener = vi.fn();

    const cleanup = setupConnectionTracker(mockSocket, listener);
    expect(listener).toHaveBeenCalledTimes(1);

    cleanup();

    mockSocket.emit('connect');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
