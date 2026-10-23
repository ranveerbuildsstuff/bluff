import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingScreen } from '../components/LandingScreen';
import { LobbyScreen } from '../components/LobbyScreen';
import { GameScreen } from '../components/GameScreen';
import { PublicGameState, RoomView } from '@bluff/shared';

describe('Mini: Join by Link & text fixes (Web UI)', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it('LandingScreen: prefills valid uppercase room code and shows "You\'re joining room CODE"', () => {
    // Setup window with ?room=ABC234
    global.window = {
      location: {
        search: '?room=ABC234',
        pathname: '/',
        hash: '',
        href: 'http://localhost:3000/?room=ABC234',
        origin: 'http://localhost:3000',
      },
      history: {
        replaceState: vi.fn(),
      },
    } as unknown as Window & typeof globalThis;

    const html = renderToStaticMarkup(
      <LandingScreen
        initialName="Alice"
        onCreateRoom={vi.fn()}
        onJoinRoom={vi.fn()}
        onErrorToast={vi.fn()}
      />
    );

    expect(html).toContain('value="ABC234"');
    expect(html).toContain("You&#x27;re joining room ABC234");
  });

  it('LandingScreen: normalizes lowercase room code to uppercase and shows "You\'re joining room CODE"', () => {
    global.window = {
      location: {
        search: '?room=k9x7p2',
        pathname: '/',
        hash: '',
        href: 'http://localhost:3000/?room=k9x7p2',
        origin: 'http://localhost:3000',
      },
      history: {
        replaceState: vi.fn(),
      },
    } as unknown as Window & typeof globalThis;

    const html = renderToStaticMarkup(
      <LandingScreen
        initialName="Bob"
        onCreateRoom={vi.fn()}
        onJoinRoom={vi.fn()}
        onErrorToast={vi.fn()}
      />
    );

    expect(html).toContain('value="K9X7P2"');
    expect(html).toContain("You&#x27;re joining room K9X7P2");
  });

  it('LandingScreen: silently ignores invalid room codes (wrong length or excluded chars)', () => {
    global.window = {
      location: {
        search: '?room=INVALID',
        pathname: '/',
        hash: '',
        href: 'http://localhost:3000/?room=INVALID',
        origin: 'http://localhost:3000',
      },
      history: {
        replaceState: vi.fn(),
      },
    } as unknown as Window & typeof globalThis;

    const errorToastMock = vi.fn();
    const html = renderToStaticMarkup(
      <LandingScreen
        initialName="Charlie"
        onCreateRoom={vi.fn()}
        onJoinRoom={vi.fn()}
        onErrorToast={errorToastMock}
      />
    );

    expect(html).not.toContain("You&#x27;re joining room");
    expect(html).not.toContain('value="INVALID"');
    expect(errorToastMock).not.toHaveBeenCalled();
  });

  it('LobbyScreen: renders "Share Room Code" and separate "Copy code" buttons with touch targets >= 44px', () => {
    global.window = {
      location: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000',
      },
    } as unknown as Window & typeof globalThis;

    const roomView: RoomView = {
      roomCode: 'ABC234',
      hostId: '11111111-1111-4111-8111-111111111111',
      status: 'LOBBY',
      players: [
        {
          playerId: '11111111-1111-4111-8111-111111111111',
          name: 'HostPlayer',
          connected: true,
        },
      ],
      settings: { cardsPerPlayer: 7 },
    };

    const html = renderToStaticMarkup(
      <LobbyScreen
        roomView={roomView}
        currentPlayerId="11111111-1111-4111-8111-111111111111"
        isSocketConnected={true}
        onLeaveRoom={vi.fn()}
        onUpdateSettings={vi.fn()}
        onStartGame={vi.fn()}
        onInfoToast={vi.fn()}
        onErrorToast={vi.fn()}
      />
    );

    expect(html).toContain('Share Room Code');
    expect(html).toContain('Copy code');
    // Both share and copy buttons should have min-h-[44px]
    expect(html).toMatch(/min-h-\[44px\][^>]*>.*?Share Room Code/s);
    expect(html).toMatch(/min-h-\[44px\][^>]*>.*?Copy code/s);
  });

  it('GameScreen: Opponents header renders singular "1 player" when 1 opponent', () => {
    const viewerId = '11111111-1111-4111-8111-111111111111';
    const opponentId = '22222222-2222-4222-8222-222222222222';

    const state: PublicGameState = {
      roomCode: 'ABC234',
      hostId: viewerId,
      status: 'PLAYING',
      settings: { cardsPerPlayer: 5 },
      players: [
        { playerId: viewerId, name: 'Viewer', connected: true, handCount: 5 },
        { playerId: opponentId, name: 'Opponent1', connected: true, handCount: 5 },
      ],
      myHand: [{ id: 'H-A', suit: 'H', rank: 'A' }],
      turnOrder: [viewerId, opponentId],
      currentTurnId: viewerId,
      requiredRank: 'A',
      pile: { count: 0, lastPlay: null },
      playSeq: 0,
      serverNow: Date.now(),
    };

    const html = renderToStaticMarkup(
      <GameScreen
        gameState={state}
        currentPlayerId={viewerId}
        isSocketConnected={true}
        isHost={true}
        challengeResult={null}
        onDismissChallengeResult={vi.fn()}
        onLeaveRoom={vi.fn()}
        onPlayTurn={vi.fn()}
        onCallBluff={vi.fn()}
        onPlayAgain={vi.fn()}
      />
    );

    expect(html).toContain('1 player');
    expect(html).not.toContain('1 players');
  });

  it('GameScreen: Opponents header renders plural "2 players" when 2 opponents', () => {
    const viewerId = '11111111-1111-4111-8111-111111111111';
    const opponent1Id = '22222222-2222-4222-8222-222222222222';
    const opponent2Id = '33333333-3333-4333-8333-333333333333';

    const state: PublicGameState = {
      roomCode: 'ABC234',
      hostId: viewerId,
      status: 'PLAYING',
      settings: { cardsPerPlayer: 5 },
      players: [
        { playerId: viewerId, name: 'Viewer', connected: true, handCount: 5 },
        { playerId: opponent1Id, name: 'Opponent1', connected: true, handCount: 5 },
        { playerId: opponent2Id, name: 'Opponent2', connected: true, handCount: 5 },
      ],
      myHand: [{ id: 'H-A', suit: 'H', rank: 'A' }],
      turnOrder: [viewerId, opponent1Id, opponent2Id],
      currentTurnId: viewerId,
      requiredRank: 'A',
      pile: { count: 0, lastPlay: null },
      playSeq: 0,
      serverNow: Date.now(),
    };

    const html = renderToStaticMarkup(
      <GameScreen
        gameState={state}
        currentPlayerId={viewerId}
        isSocketConnected={true}
        isHost={true}
        challengeResult={null}
        onDismissChallengeResult={vi.fn()}
        onLeaveRoom={vi.fn()}
        onPlayTurn={vi.fn()}
        onCallBluff={vi.fn()}
        onPlayAgain={vi.fn()}
      />
    );

    expect(html).toContain('2 players');
  });
});
