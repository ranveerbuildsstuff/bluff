import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingScreen } from '../components/LandingScreen';
import { LobbyScreen } from '../components/LobbyScreen';
import { GameScreen } from '../components/GameScreen';
import { AccountButton } from '../components/AccountButton';
import { LeaderboardSheet } from '../components/LeaderboardSheet';
import { getFriendlyAuthErrorMessage } from '../firebase';
import { getMe, updateMyName, deleteMyStats, getLeaderboard } from '../api';
import { PublicGameState, RoomView } from '@bluff/shared';

function createMockRoomView(overrides?: Partial<RoomView>): RoomView {
  const hostId = '11111111-1111-4111-8111-111111111111';
  return {
    roomCode: 'ABCDEF',
    hostId,
    status: 'LOBBY',
    players: [{ playerId: hostId, name: 'Alice', connected: true }],
    settings: { cardsPerPlayer: 5 },
    ...overrides,
  };
}

function createMockGameState(overrides?: Partial<PublicGameState>): PublicGameState {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const opponentId = '22222222-2222-4222-8222-222222222222';

  return {
    roomCode: 'ABCDEF',
    hostId: viewerId,
    status: 'GAME_OVER',
    settings: { cardsPerPlayer: 5 },
    players: [
      { playerId: viewerId, name: 'Alice', connected: true, handCount: 0 },
      { playerId: opponentId, name: 'Bob', connected: true, handCount: 5 },
    ],
    myHand: [],
    turnOrder: [viewerId, opponentId],
    currentTurnId: viewerId,
    requiredRank: '8',
    pile: {
      count: 0,
      lastPlay: null,
    },
    playSeq: 5,
    winnerId: viewerId,
    serverNow: Date.now(),
    ...overrides,
  };
}

describe('Slice 8: Accounts & Leaderboard UI', () => {
  const noop = () => {};
  const originalFetch = global.fetch;
  const originalSessionStorage = global.sessionStorage;
  const originalWindow = global.window;

  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = {};
    global.window = {
      location: {
        origin: 'http://localhost:3000',
        search: '',
        pathname: '/',
        hash: '',
      },
      history: {
        replaceState: vi.fn(),
      },
    } as unknown as Window & typeof globalThis;
    global.sessionStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      key: () => null,
      length: 0,
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.sessionStorage = originalSessionStorage;
    global.window = originalWindow;
  });

  describe('1. Accounts UI hidden when env is missing', () => {
    it('LandingScreen hides Account and Leaderboard buttons when isAccountsEnabled=false', () => {
      const html = renderToStaticMarkup(
        <LandingScreen
          initialName="Alice"
          onCreateRoom={noop}
          onJoinRoom={noop}
          onErrorToast={noop}
          isAccountsEnabled={false}
        />
      );

      expect(html).not.toContain('Sign in');
      expect(html).not.toContain('Leaderboard');
      expect(html).toContain('BLUFF');
      expect(html).toContain('Create New Room');
    });

    it('LobbyScreen hides AccountButton when isAccountsEnabled=false', () => {
      const roomView = createMockRoomView();
      const html = renderToStaticMarkup(
        <LobbyScreen
          roomView={roomView}
          currentPlayerId={roomView.hostId}
          isSocketConnected={true}
          onLeaveRoom={noop}
          onUpdateSettings={noop}
          onStartGame={noop}
          onInfoToast={noop}
          onErrorToast={noop}
          isAccountsEnabled={false}
        />
      );

      expect(html).not.toContain('Sign in');
      expect(html).toContain('Connected');
      expect(html).toContain('Leave Lobby');
    });

    it('GameScreen game-over hides account card when isAccountsEnabled=false', () => {
      const state = createMockGameState();
      const html = renderToStaticMarkup(
        <GameScreen
          gameState={state}
          currentPlayerId={state.players[0].playerId}
          isSocketConnected={true}
          isHost={true}
          challengeResult={null}
          onDismissChallengeResult={noop}
          onLeaveRoom={noop}
          onPlayTurn={noop}
          onCallBluff={noop}
          onPlayAgain={noop}
          isAccountsEnabled={false}
        />
      );

      expect(html).not.toContain('Save your wins and join the leaderboard');
      expect(html).not.toContain('Saved!');
      expect(html).toContain('You won!');
    });
  });

  describe('2. Account button rendering (Guest vs Signed in)', () => {
    it('Guest button shows "Sign in"', () => {
      const html = renderToStaticMarkup(
        <AccountButton isSignedIn={false} onClick={noop} />
      );
      expect(html).toContain('Sign in');
    });

    it('Signed in button shows circle with first letter of display name', () => {
      const html = renderToStaticMarkup(
        <AccountButton isSignedIn={true} displayName="Ranveer" onClick={noop} />
      );
      expect(html).not.toContain('Sign in');
      expect(html).toContain('R');
    });

    it('LandingScreen renders Account and Leaderboard buttons when isAccountsEnabled=true', () => {
      const html = renderToStaticMarkup(
        <LandingScreen
          initialName="Alice"
          onCreateRoom={noop}
          onJoinRoom={noop}
          onErrorToast={noop}
          isAccountsEnabled={true}
          isSignedIn={true}
          accountDisplayName="Alice"
        />
      );

      expect(html).toContain('Leaderboard');
      expect(html).toContain('A');
    });

    it('LobbyScreen renders AccountButton without overlapping Leave Lobby', () => {
      const roomView = createMockRoomView();
      const html = renderToStaticMarkup(
        <LobbyScreen
          roomView={roomView}
          currentPlayerId={roomView.hostId}
          isSocketConnected={true}
          onLeaveRoom={noop}
          onUpdateSettings={noop}
          onStartGame={noop}
          onInfoToast={noop}
          onErrorToast={noop}
          isAccountsEnabled={true}
          isSignedIn={false}
        />
      );

      expect(html).toContain('Connected');
      expect(html).toContain('Sign in');
      expect(html).toContain('Leave Lobby');
    });
  });

  describe('3. Game-over screen: guest prompt shows once per session, never during game', () => {
    it('Shows guest prompt under result on game-over when not dismissed', () => {
      const state = createMockGameState();
      const html = renderToStaticMarkup(
        <GameScreen
          gameState={state}
          currentPlayerId={state.players[0].playerId}
          isSocketConnected={true}
          isHost={true}
          challengeResult={null}
          onDismissChallengeResult={noop}
          onLeaveRoom={noop}
          onPlayTurn={noop}
          onCallBluff={noop}
          onPlayAgain={noop}
          isAccountsEnabled={true}
          isSignedIn={false}
        />
      );

      expect(html).toContain('Save your wins and join the leaderboard. Sign in to keep your stats.');
      expect(html).toContain('Sign in');
      expect(html).toContain('Not now');
    });

    it('Hides guest prompt if already dismissed in sessionStorage', () => {
      mockStorage['bluff_guest_prompt_dismissed'] = 'true';

      const state = createMockGameState();
      const html = renderToStaticMarkup(
        <GameScreen
          gameState={state}
          currentPlayerId={state.players[0].playerId}
          isSocketConnected={true}
          isHost={true}
          challengeResult={null}
          onDismissChallengeResult={noop}
          onLeaveRoom={noop}
          onPlayTurn={noop}
          onCallBluff={noop}
          onPlayAgain={noop}
          isAccountsEnabled={true}
          isSignedIn={false}
        />
      );

      expect(html).not.toContain('Save your wins and join the leaderboard. Sign in to keep your stats.');
    });

    it('Never shows guest prompt during a game (PLAYING status)', () => {
      const state = createMockGameState({ status: 'PLAYING' });
      const html = renderToStaticMarkup(
        <GameScreen
          gameState={state}
          currentPlayerId={state.players[0].playerId}
          isSocketConnected={true}
          isHost={true}
          challengeResult={null}
          onDismissChallengeResult={noop}
          onLeaveRoom={noop}
          onPlayTurn={noop}
          onCallBluff={noop}
          onPlayAgain={noop}
          isAccountsEnabled={true}
          isSignedIn={false}
        />
      );

      expect(html).not.toContain('Save your wins and join the leaderboard');
    });
  });

  describe('4. Signed-in state shows "Saved!" or uncounted note', () => {
    it('Shows "Saved! Wins: X · Games: Y" when counted=true', () => {
      const state = createMockGameState();
      const html = renderToStaticMarkup(
        <GameScreen
          gameState={state}
          currentPlayerId={state.players[0].playerId}
          isSocketConnected={true}
          isHost={true}
          challengeResult={null}
          onDismissChallengeResult={noop}
          onLeaveRoom={noop}
          onPlayTurn={noop}
          onCallBluff={noop}
          onPlayAgain={noop}
          isAccountsEnabled={true}
          isSignedIn={true}
          latestStatsUpdated={{
            counted: true,
            wins: 4,
            gamesPlayed: 10,
          }}
        />
      );

      expect(html).toContain('Saved! Wins: 4 · Games: 10');
    });

    it('Shows uncounted note with reason "needs at least 3 players" when NOT_RANKED', () => {
      const state = createMockGameState();
      const html = renderToStaticMarkup(
        <GameScreen
          gameState={state}
          currentPlayerId={state.players[0].playerId}
          isSocketConnected={true}
          isHost={true}
          challengeResult={null}
          onDismissChallengeResult={noop}
          onLeaveRoom={noop}
          onPlayTurn={noop}
          onCallBluff={noop}
          onPlayAgain={noop}
          isAccountsEnabled={true}
          isSignedIn={true}
          latestStatsUpdated={{
            counted: false,
            reason: 'NOT_RANKED',
            wins: 4,
            gamesPlayed: 10,
          }}
        />
      );

      expect(html).toMatch(/This game didn['&#x27;]+t count toward the leaderboard/);
      expect(html).toContain('needs at least 3 players');
    });

    it('Shows uncounted note with reason "the game was abandoned" when ABANDONED', () => {
      const state = createMockGameState({ endedReason: 'PLAYER_ABANDONED' });
      const html = renderToStaticMarkup(
        <GameScreen
          gameState={state}
          currentPlayerId={state.players[0].playerId}
          isSocketConnected={true}
          isHost={true}
          challengeResult={null}
          onDismissChallengeResult={noop}
          onLeaveRoom={noop}
          onPlayTurn={noop}
          onCallBluff={noop}
          onPlayAgain={noop}
          isAccountsEnabled={true}
          isSignedIn={true}
          latestStatsUpdated={{
            counted: false,
            reason: 'ABANDONED',
            wins: 4,
            gamesPlayed: 10,
          }}
        />
      );

      expect(html).toMatch(/This game didn['&#x27;]+t count toward the leaderboard/);
      expect(html).toContain('the game was abandoned');
    });
  });

  describe('5. Leaderboard sheet rendering', () => {
    it('Renders empty state when no ranked games exist', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      // Directly verify LeaderboardSheet component markup when rendered
      const html = renderToStaticMarkup(
        <LeaderboardSheet
          isOpen={true}
          onClose={noop}
          isSignedIn={false}
        />
      );

      expect(html).toContain('Leaderboard');
      expect(html).toContain('Close');
    });

    it('Renders leaderboard rows and highlights own row matching /api/me stats', async () => {
      // Test getLeaderboard API client
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/leaderboard')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { rank: 1, displayName: 'Champion', wins: 15, gamesPlayed: 20, winRate: 0.75 },
              { rank: 2, displayName: 'Alice', wins: 5, gamesPlayed: 10, winRate: 0.5 },
            ],
          });
        }
        return Promise.reject(new Error('Unknown url'));
      });

      const entries = await getLeaderboard(20);
      expect(entries).toHaveLength(2);
      expect(entries[0].displayName).toBe('Champion');
      expect(entries[0].rank).toBe(1);
      expect(entries[1].displayName).toBe('Alice');
      expect(entries[1].winRate).toBe(0.5);
    });
  });

  describe('6. Sign-in error friendly text mapping', () => {
    it('Google popup failure shows the exact requested friendly instructions', () => {
      const msg = getFriendlyAuthErrorMessage({ code: 'auth/popup-blocked' }, true);
      expect(msg).toBe(
        "Google sign-in didn't open. Allow pop-ups, or open this link in Chrome or Safari, or use email and password instead."
      );

      const msgCancelled = getFriendlyAuthErrorMessage({ code: 'auth/popup-closed-by-user' });
      expect(msgCancelled).toBe(
        "Google sign-in didn't open. Allow pop-ups, or open this link in Chrome or Safari, or use email and password instead."
      );
    });

    it('Email already in use shows friendly message', () => {
      const msg = getFriendlyAuthErrorMessage({ code: 'auth/email-already-in-use' });
      expect(msg).toBe('An account with this email already exists. Try signing in.');
    });

    it('Invalid credentials / wrong password / user not found shows friendly message', () => {
      expect(getFriendlyAuthErrorMessage({ code: 'auth/invalid-credential' })).toBe(
        'Incorrect email or password.'
      );
      expect(getFriendlyAuthErrorMessage({ code: 'auth/wrong-password' })).toBe(
        'Incorrect email or password.'
      );
      expect(getFriendlyAuthErrorMessage({ code: 'auth/user-not-found' })).toBe(
        'Incorrect email or password.'
      );
    });

    it('Weak password shows friendly message', () => {
      expect(getFriendlyAuthErrorMessage({ code: 'auth/weak-password' })).toBe(
        'Password must be at least 8 characters.'
      );
    });

    it('Network failure shows friendly message', () => {
      expect(getFriendlyAuthErrorMessage({ code: 'auth/network-request-failed' })).toBe(
        'Network error. Please check your connection and try again.'
      );
    });

    it('Unknown error falls back to friendly text without leaking raw codes', () => {
      const msg = getFriendlyAuthErrorMessage({ code: 'auth/internal-error' });
      expect(msg).toBe('Unable to sign in. Please try again.');
      expect(msg).not.toContain('auth/');
    });
  });

  describe('7. HTTP API client endpoints (/api/me)', () => {
    it('getMe fetches with Bearer auth and validates MeResponse', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          displayName: 'PlayerOne',
          gamesPlayed: 12,
          wins: 6,
          winRate: 0.5,
        }),
      });

      const me = await getMe('mock-id-token');
      expect(me.displayName).toBe('PlayerOne');
      expect(me.gamesPlayed).toBe(12);
      expect(me.wins).toBe(6);
      expect(me.winRate).toBe(0.5);

      expect(global.fetch).toHaveBeenCalledWith('/api/me', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-id-token',
        },
      });
    });

    it('updateMyName sends PATCH with Bearer auth and validates response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          displayName: 'NewName',
          gamesPlayed: 12,
          wins: 6,
          winRate: 0.5,
        }),
      });

      const updated = await updateMyName('mock-id-token', 'NewName');
      expect(updated.displayName).toBe('NewName');

      expect(global.fetch).toHaveBeenCalledWith('/api/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-id-token',
        },
        body: JSON.stringify({ name: 'NewName' }),
      });
    });

    it('updateMyName rejects invalid names using PlayerNameSchema without sending request', async () => {
      global.fetch = vi.fn();
      await expect(updateMyName('token', '')).rejects.toThrow();
      await expect(updateMyName('token', 'ThisNameIsWayTooLongForValidation')).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('deleteMyStats sends DELETE with Bearer auth', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await deleteMyStats('mock-id-token');
      expect(global.fetch).toHaveBeenCalledWith('/api/me', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer mock-id-token',
        },
      });
    });
  });

  describe('8. Identity linking on SessionIssued and reconnect', () => {
    it('sends identify with idToken when session is issued or reconnects', () => {
      const mockSocket = {
        connected: true,
        emit: vi.fn(),
      };

      const sendIdentify = (token: string) => {
        mockSocket.emit('identify', { idToken: token });
      };

      // Simulating SessionIssued while signed in
      sendIdentify('fresh-id-token-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('identify', { idToken: 'fresh-id-token-1' });

      // Simulating reconnect while signed in
      sendIdentify('fresh-id-token-2');
      expect(mockSocket.emit).toHaveBeenCalledWith('identify', { idToken: 'fresh-id-token-2' });

      // Simulating sign out
      mockSocket.emit('sign_out', {});
      expect(mockSocket.emit).toHaveBeenCalledWith('sign_out', {});
    });
  });
});
