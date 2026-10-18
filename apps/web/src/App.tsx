import { useState, useEffect, useCallback } from 'react';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SessionIssued,
  RoomView,
  PublicGameState,
  ChallengeResult,
  SessionIssuedSchema,
  RoomViewSchema,
  PublicGameStateSchema,
  ChallengeResultSchema,
  SettingsClampedSchema,
  ErrorEventSchema,
  PlayerDisconnectedSchema,
  PlayerReconnectedSchema,
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
import { GameScreen } from './components/GameScreen';
import { ToastContainer, ToastItem } from './components/ToastContainer';

export function App() {
  const [session, setSession] = useState<SessionIssued | null>(() => getSession());
  const [roomView, setRoomView] = useState<RoomView | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);
  const [savedName, setSavedName] = useState<string>(() => getSavedName());
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(() =>
    Boolean(socket.connected)
  );
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
      setIsSocketConnected(Boolean(socket.connected || true));
      const parsed = RoomViewSchema.safeParse(data);
      if (!parsed.success) return;
      setRoomView(parsed.data);
      if (parsed.data.status === 'LOBBY') {
        setGameState(null);
        setChallengeResult(null);
      }
    };

    const onGameState = (data: unknown) => {
      setIsSocketConnected(Boolean(socket.connected || true));
      const parsed = PublicGameStateSchema.safeParse(data);
      if (!parsed.success) return;
      setGameState(parsed.data);
    };

    const onChallengeResult = (data: unknown) => {
      const parsed = ChallengeResultSchema.safeParse(data);
      if (!parsed.success) return;
      setChallengeResult(parsed.data);
    };

    const onSettingsClamped = (data: unknown) => {
      const parsed = SettingsClampedSchema.safeParse(data);
      if (!parsed.success) return;
      addToast(
        `Cards per player adjusted to ${parsed.data.cardsPerPlayer} (room limit)`,
        'info'
      );
    };

    const onPlayerDisconnected = (data: unknown) => {
      const parsed = PlayerDisconnectedSchema.safeParse(data);
      if (!parsed.success) return;
      addToast(`${parsed.data.name} disconnected. Game paused.`, 'info');
    };

    const onPlayerReconnected = (data: unknown) => {
      const parsed = PlayerReconnectedSchema.safeParse(data);
      if (!parsed.success) return;
      addToast(`${parsed.data.name} reconnected.`, 'info');
    };

    const onError = (data: unknown) => {
      const parsed = ErrorEventSchema.safeParse(data);
      const message = parsed.success ? parsed.data.message : 'An error occurred';
      addToast(message, 'error');

      if (
        parsed.success &&
        (parsed.data.code === 'NOT_IN_ROOM' || parsed.data.code === 'ROOM_NOT_FOUND')
      ) {
        clearSession();
        setSession(null);
        setRoomView(null);
        setGameState(null);
        setChallengeResult(null);
        updateSocketAuth('');
      }
    };

    socket.on('connect', onConnect);
    socket.on(SERVER_EVENTS.SESSION_ISSUED, onSessionIssued);
    socket.on(SERVER_EVENTS.ROOM_VIEW, onRoomView);
    socket.on(SERVER_EVENTS.GAME_STATE, onGameState);
    socket.on(SERVER_EVENTS.CHALLENGE_RESULT, onChallengeResult);
    socket.on(SERVER_EVENTS.SETTINGS_CLAMPED, onSettingsClamped);
    socket.on(SERVER_EVENTS.PLAYER_DISCONNECTED, onPlayerDisconnected);
    socket.on(SERVER_EVENTS.PLAYER_RECONNECTED, onPlayerReconnected);
    socket.on(SERVER_EVENTS.ERROR, onError);

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
      socket.off(SERVER_EVENTS.GAME_STATE, onGameState);
      socket.off(SERVER_EVENTS.CHALLENGE_RESULT, onChallengeResult);
      socket.off(SERVER_EVENTS.SETTINGS_CLAMPED, onSettingsClamped);
      socket.off(SERVER_EVENTS.PLAYER_DISCONNECTED, onPlayerDisconnected);
      socket.off(SERVER_EVENTS.PLAYER_RECONNECTED, onPlayerReconnected);
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

  const handleUpdateSettings = (cardsPerPlayer: number) => {
    socket.emit(CLIENT_EVENTS.UPDATE_SETTINGS, { cardsPerPlayer });
  };

  const handleStartGame = () => {
    socket.emit(CLIENT_EVENTS.START_GAME, {});
  };

  const handleLeaveRoom = () => {
    socket.emit(CLIENT_EVENTS.LEAVE_ROOM, {});
    clearSession();
    setSession(null);
    setRoomView(null);
    setGameState(null);
    setChallengeResult(null);
    updateSocketAuth('');
  };

  const handlePlayTurn = (selectedCardIds: string[]) => {
    socket.emit(CLIENT_EVENTS.PLAY_TURN, { selectedCardIds });
  };

  const handleCallBluff = (playSeq: number) => {
    socket.emit(CLIENT_EVENTS.CALL_BLUFF, { playSeq });
  };

  const handlePlayAgain = () => {
    socket.emit(CLIENT_EVENTS.PLAY_AGAIN, {});
  };

  const isCurrentlyConnected = isSocketConnected || Boolean(socket.connected);

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col items-center relative overflow-x-hidden w-full">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {roomView && session ? (
        roomView.status !== 'LOBBY' && gameState ? (
          <GameScreen
            gameState={gameState}
            currentPlayerId={session.playerId}
            isSocketConnected={isCurrentlyConnected}
            isHost={roomView.hostId === session.playerId}
            challengeResult={challengeResult}
            onDismissChallengeResult={() => setChallengeResult(null)}
            onLeaveRoom={handleLeaveRoom}
            onPlayTurn={handlePlayTurn}
            onCallBluff={handleCallBluff}
            onPlayAgain={handlePlayAgain}
          />
        ) : (
          <LobbyScreen
            roomView={roomView}
            currentPlayerId={session.playerId}
            isSocketConnected={isCurrentlyConnected}
            onLeaveRoom={handleLeaveRoom}
            onUpdateSettings={handleUpdateSettings}
            onStartGame={handleStartGame}
            onInfoToast={(msg) => addToast(msg, 'info')}
            onErrorToast={(msg) => addToast(msg, 'error')}
          />
        )
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
