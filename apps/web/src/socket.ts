import { io, Socket } from 'socket.io-client';
import { getSession } from './storage';
import { CLIENT_EVENTS } from '@bluff/shared';

const serverUrl = import.meta.env.VITE_SERVER_URL || undefined;

export const socket: Socket = io(serverUrl, {
  autoConnect: true,
  auth: {
    sessionToken: getSession()?.sessionToken || '',
  },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export function updateSocketAuth(sessionToken: string): void {
  socket.auth = { sessionToken };
}

export function setupVisibilityReconnect(onSync?: () => void): () => void {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      if (!socket.connected) {
        socket.connect();
      }
      onSync?.();
      const session = getSession();
      if (session) {
        socket.emit(CLIENT_EVENTS.GET_ROOM_VIEW, {});
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
