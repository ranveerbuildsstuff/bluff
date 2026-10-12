import { useState, useEffect, useCallback } from 'react';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SessionIssued,
  RoomView,
  SessionIssuedSchema,
  RoomViewSchema,
  ErrorEventSchema,
} from '@bluff/shared';
import { socket, updateSocketAuth, setupVisibilityReconnect } from './socket';
import { setupConnectionTracker } from './connection-tracker';
import {
  getSession,
  saveSession,
  clearSession,
  getSavedName,
  saveSavedName,
} from './storage';
import { LandingScreen } from './components/LandingScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { ToastContainer, ToastItem } from './components/ToastContainer';

export function App() {
  const [session, setSession] = useState<SessionIssued | null>(() => getSession());
  const [roomView, setRoomView] = useState<RoomView | null>(null);
  const [savedName, setSavedName] = useState<string>(() => getSavedName());
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(() => Boolean(socket.connected));
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: 'error' | 'info' = 'error') => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Setup connection tracker and socket listeners
  useEffect(() => {
    const cleanupConnectionTracker = setupConnectionTracker(socket, (connected) => {
      setIsSocketConnected(connected);
    });

    const onConnect = () => {
      setIsSocketConnected(true);
      const currentSession = getSession();
      if (currentSession) {
        socket.emit(CLIENT_EVENTS.GET_ROOM_VIEW, {});
      }
    };

    const onSessionIssued = (data: unknown) => {
      setIsSocketConnected(Boolean(socket.connected || true));
      const parsed = SessionIssuedSchema.safeParse(data);
      if (!parsed.success) return;
      saveSession(parsed.data);
      setSession(parsed.data);
      updateSocketAuth(parsed.data.sessionToken);
    };

    const onRoomView = (data: unknown) => {
      // Re-sync connection status whenever a room update arrives
      setIsSocketConnected(Boolean(socket.connected || true));
      const parsed = RoomViewSchema.safeParse(data);
      if (!parsed.success) return;
      setRoomView(parsed.data);
    };

    const onError = (data: unknown) => {
      const parsed = ErrorEventSchema.safeParse(data);
      const message = parsed.success ? parsed.data.message : 'An error occurred';
      addToast(message, 'error');

      if (parsed.success && (parsed.data.code === 'NOT_IN_ROOM' || parsed.data.code === 'ROOM_NOT_FOUND')) {
        // If room is invalid or gone, clear session
        clearSession();
        setSession(null);
        setRoomView(null);
        updateSocketAuth('');
      }
    };

    socket.on('connect', onConnect);
    socket.on(SERVER_EVENTS.SESSION_ISSUED, onSessionIssued);
    socket.on(SERVER_EVENTS.ROOM_VIEW, onRoomView);
    socket.on(SERVER_EVENTS.ERROR, onError);

    // Initial query if we already have a session
    if (socket.connected && session) {
      socket.emit(CLIENT_EVENTS.GET_ROOM_VIEW, {});
    }

    const cleanupReconnect = setupVisibilityReconnect(() => {
      setIsSocketConnected(Boolean(socket.connected));
    });

    return () => {
      cleanupConnectionTracker();
      socket.off('connect', onConnect);
      socket.off(SERVER_EVENTS.SESSION_ISSUED, onSessionIssued);
      socket.off(SERVER_EVENTS.ROOM_VIEW, onRoomView);
      socket.off(SERVER_EVENTS.ERROR, onError);
      cleanupReconnect();
    };
  }, [addToast, session]);

  const handleCreateRoom = (playerName: string) => {
    saveSavedName(playerName);
    setSavedName(playerName);
    socket.emit(CLIENT_EVENTS.CREATE_ROOM, { playerName });
  };

  const handleJoinRoom = (roomCode: string, playerName: string) => {
    saveSavedName(playerName);
    setSavedName(playerName);
    socket.emit(CLIENT_EVENTS.JOIN_ROOM, { roomCode, playerName });
  };

  const handleLeaveRoom = () => {
    socket.emit(CLIENT_EVENTS.LEAVE_ROOM, {});
    clearSession();
    setSession(null);
    setRoomView(null);
    updateSocketAuth('');
  };

  // Derive active connection state: true if either tracking state or socket itself is connected
  const isCurrentlyConnected = isSocketConnected || Boolean(socket.connected);

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center relative overflow-hidden">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {roomView && session ? (
        <LobbyScreen
          roomView={roomView}
          currentPlayerId={session.playerId}
          isSocketConnected={isCurrentlyConnected}
          onLeaveRoom={handleLeaveRoom}
          onInfoToast={(msg) => addToast(msg, 'info')}
          onErrorToast={(msg) => addToast(msg, 'error')}
        />
      ) : (
        <LandingScreen
          initialName={savedName}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onErrorToast={(msg) => addToast(msg, 'error')}
        />
      )}
    </main>
  );
}

export default App;
