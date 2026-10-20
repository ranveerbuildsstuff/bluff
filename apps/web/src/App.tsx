import { useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SessionIssued,
  RoomView,
  PublicGameState,
  ChallengeResult,
  StatsUpdatedEvent,
  SessionIssuedSchema,
  RoomViewSchema,
  PublicGameStateSchema,
  ChallengeResultSchema,
  SettingsClampedSchema,
  ErrorEventSchema,
  PlayerDisconnectedSchema,
  PlayerReconnectedSchema,
  IdentifiedEventSchema,
  StatsUpdatedEventSchema,
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
import {
  auth,
  isAccountsConfigured,
  subscribeToAuthState,
  signOutUser,
} from './firebase';
import { LandingScreen } from './components/LandingScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { ToastContainer, ToastItem } from './components/ToastContainer';
import { SignInSheet } from './components/SignInSheet';
import { AccountSheet } from './components/AccountSheet';
import { LeaderboardSheet } from './components/LeaderboardSheet';

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

  // Accounts & Stats State
  const [user, setUser] = useState<User | null>(null);
  const [accountDisplayName, setAccountDisplayName] = useState<string | null>(null);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [latestStatsUpdated, setLatestStatsUpdated] = useState<StatsUpdatedEvent | null>(null);

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

  // Listen to Firebase Auth state
  useEffect(() => {
    if (!isAccountsConfigured) return;

    const unsubscribe = subscribeToAuthState(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAccountDisplayName(currentUser.displayName || null);
        const currentSession = getSession();
        if (socket.connected && currentSession) {
          try {
            const token = await currentUser.getIdToken();
            socket.emit(CLIENT_EVENTS.IDENTIFY, { idToken: token });
          } catch {
            // Silently ignore token failure
          }
        }
      } else {
        setAccountDisplayName(null);
      }
    });

    return unsubscribe;
  }, []);

  // Setup connection tracker and socket listeners
  useEffect(() => {
    const cleanupConnectionTracker = setupConnectionTracker(socket, (connected) => {
      setIsSocketConnected(connected);
    });

    const sendIdentifyIfSignedIn = async () => {
      if (!isAccountsConfigured || !auth?.currentUser) return;
      try {
        const idToken = await auth.currentUser.getIdToken();
        socket.emit(CLIENT_EVENTS.IDENTIFY, { idToken });
      } catch {
        // Silently ignore token fetch error
      }
    };

    const onConnect = () => {
      setIsSocketConnected(true);
      const currentSession = getSession();
      if (currentSession) {
        socket.emit(CLIENT_EVENTS.GET_ROOM_VIEW, {});
        sendIdentifyIfSignedIn();
      }
    };

    const onSessionIssued = (data: unknown) => {
      setIsSocketConnected(Boolean(socket.connected || true));
      const parsed = SessionIssuedSchema.safeParse(data);
      if (!parsed.success) return;
      saveSession(parsed.data);
      setSession(parsed.data);
      updateSocketAuth(parsed.data.sessionToken);
      sendIdentifyIfSignedIn();
    };

    const onRoomView = (data: unknown) => {
      setIsSocketConnected(Boolean(socket.connected || true));
      const parsed = RoomViewSchema.safeParse(data);
      if (!parsed.success) return;
      setRoomView(parsed.data);
      if (parsed.data.status === 'LOBBY') {
        setGameState(null);
        setChallengeResult(null);
        setLatestStatsUpdated(null);
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

    const onIdentified = (data: unknown) => {
      const parsed = IdentifiedEventSchema.safeParse(data);
      if (!parsed.success) return;
      setAccountDisplayName(parsed.data.displayName);
    };

    const onStatsUpdated = (data: unknown) => {
      const parsed = StatsUpdatedEventSchema.safeParse(data);
      if (!parsed.success) return;
      setLatestStatsUpdated(parsed.data);
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
        setLatestStatsUpdated(null);
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
    socket.on(SERVER_EVENTS.IDENTIFIED, onIdentified);
    socket.on(SERVER_EVENTS.STATS_UPDATED, onStatsUpdated);
    socket.on(SERVER_EVENTS.ERROR, onError);

    if (socket.connected && session) {
      socket.emit(CLIENT_EVENTS.GET_ROOM_VIEW, {});
      sendIdentifyIfSignedIn();
    }

    const cleanupReconnect = setupVisibilityReconnect(() => {
      setIsSocketConnected(Boolean(socket.connected));
      if (socket.connected && getSession()) {
        sendIdentifyIfSignedIn();
      }
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
      socket.off(SERVER_EVENTS.IDENTIFIED, onIdentified);
      socket.off(SERVER_EVENTS.STATS_UPDATED, onStatsUpdated);
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
    setLatestStatsUpdated(null);
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

  const handleOpenAccount = () => {
    if (user) {
      setIsAccountOpen(true);
    } else {
      setIsSignInOpen(true);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setUser(null);
    setAccountDisplayName(null);
    setLatestStatsUpdated(null);
    if (session) {
      socket.emit(CLIENT_EVENTS.SIGN_OUT, {});
    }
  };

  const handleSignInSuccess = async () => {
    if (auth?.currentUser && session) {
      try {
        const token = await auth.currentUser.getIdToken();
        socket.emit(CLIENT_EVENTS.IDENTIFY, { idToken: token });
      } catch {
        // Silently ignore
      }
    }
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
            isAccountsEnabled={isAccountsConfigured}
            isSignedIn={Boolean(user)}
            latestStatsUpdated={latestStatsUpdated}
            onOpenSignIn={() => setIsSignInOpen(true)}
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
            isAccountsEnabled={isAccountsConfigured}
            isSignedIn={Boolean(user)}
            accountDisplayName={accountDisplayName}
            onOpenAccount={handleOpenAccount}
          />
        )
      ) : (
        <LandingScreen
          initialName={savedName}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onErrorToast={(msg) => addToast(msg, 'error')}
          isAccountsEnabled={isAccountsConfigured}
          isSignedIn={Boolean(user)}
          accountDisplayName={accountDisplayName}
          onOpenAccount={handleOpenAccount}
          onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
        />
      )}

      {isAccountsConfigured && (
        <>
          <SignInSheet
            isOpen={isSignInOpen}
            onClose={() => setIsSignInOpen(false)}
            onSuccess={handleSignInSuccess}
          />
          <AccountSheet
            isOpen={isAccountOpen}
            onClose={() => setIsAccountOpen(false)}
            onSignOut={handleSignOut}
            onNameUpdated={(newName) => setAccountDisplayName(newName)}
            onStatsDeleted={() => setLatestStatsUpdated(null)}
          />
          <LeaderboardSheet
            isOpen={isLeaderboardOpen}
            onClose={() => setIsLeaderboardOpen(false)}
            isSignedIn={Boolean(user)}
          />
        </>
      )}
    </main>
  );
}

export default App;
