import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingScreen } from '../components/LandingScreen';
import { LobbyScreen } from '../components/LobbyScreen';
import { HowToPlayModal } from '../components/HowToPlayModal';
import { Button } from '../ui/Button';
import { Avatar, hashNameColor } from '../ui/Avatar';
import { PlayingCard } from '../ui/PlayingCard';
import { Sheet } from '../ui/Sheet';
import { Pill } from '../ui/Pill';
import { Card } from '../ui/Card';
import { Toast } from '../ui/Toast';
import type { RoomView } from '@bluff/shared';

describe('Slice 10: Design System + Landing + Lobby + How to Play', () => {
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;

  let storageMock: Record<string, string> = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMock = {};
    const mockStorage = {
      getItem: vi.fn((key: string) => storageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storageMock[key];
      }),
      clear: vi.fn(() => {
        storageMock = {};
      }),
    };

    global.localStorage = mockStorage as unknown as Storage;
    global.window = {
      location: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000',
        search: '',
        pathname: '/',
        hash: '',
      },
      history: {
        replaceState: vi.fn(),
      },
      localStorage: mockStorage,
    } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  });

  describe('Shared UI Kit components', () => {
    it('Button: renders primary, secondary, ghost, danger variants with >=44px touch targets', () => {
      const primaryHtml = renderToStaticMarkup(<Button variant="primary">Play</Button>);
      expect(primaryHtml).toContain('bg-gradient-to-r');
      expect(primaryHtml).toContain('min-h-[44px]');

      const secondaryHtml = renderToStaticMarkup(<Button variant="secondary">Cancel</Button>);
      expect(secondaryHtml).toContain('bg-[#221440]');
      expect(secondaryHtml).toContain('min-h-[44px]');

      const ghostHtml = renderToStaticMarkup(<Button variant="ghost">Skip</Button>);
      expect(ghostHtml).toContain('bg-transparent');

      const dangerHtml = renderToStaticMarkup(<Button variant="danger">Call</Button>);
      expect(dangerHtml).toContain('bg-[#F43F5E]');
    });

    it('Button: handles loading state with accessible spinner and disabled state', () => {
      const loadingHtml = renderToStaticMarkup(<Button isLoading>Submit</Button>);
      expect(loadingHtml).toContain('animate-spin');
      expect(loadingHtml).toContain('aria-busy="true"');
      expect(loadingHtml).toContain('disabled=""');
    });

    it('Sheet: provides focusable dialog attributes, backdrop, and title', () => {
      const html = renderToStaticMarkup(
        <Sheet isOpen={true} onClose={vi.fn()} title="Test Dialog" subtitle="Dialog subtitle">
          <div>Sheet body content</div>
        </Sheet>
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Test Dialog');
      expect(html).toContain('Dialog subtitle');
      expect(html).toContain('Sheet body content');
      expect(html).toContain('aria-label="Close dialog"');
    });

    it('Card & Pill: render styled surface containers and status tags', () => {
      const cardHtml = renderToStaticMarkup(
        <Card variant="surface" padding="md">
          <span>Card text</span>
        </Card>
      );
      expect(cardHtml).toContain('bg-[#1A1030]');
      expect(cardHtml).toContain('border-[rgba(167,139,250,0.18)]');

      const pillHtml = renderToStaticMarkup(<Pill variant="gold">👑 Host</Pill>);
      expect(pillHtml).toContain('👑 Host');
      expect(pillHtml).toContain('text-[#F5B942]');
    });

    it('Avatar: renders deterministic initials and background colors based on name hash', () => {
      const color1 = hashNameColor('Alice');
      const color2 = hashNameColor('Bob');
      expect(color1).toBeDefined();
      expect(color2).toBeDefined();

      const html = renderToStaticMarkup(<Avatar name="Meera" size="md" />);
      expect(html).toContain('M');
      expect(html).toContain('aria-label="Avatar for Meera"');
    });

    it('PlayingCard: renders SVG/CSS face-up card and geometric patterned face-down card without image files', () => {
      const faceUp = renderToStaticMarkup(<PlayingCard rank="A" suit="S" size="md" />);
      expect(faceUp).toContain('A');
      expect(faceUp).toContain('<svg');
      expect(faceUp).not.toContain('<img');

      const faceDown = renderToStaticMarkup(<PlayingCard faceDown size="md" label="2 x Kings" />);
      expect(faceDown).toContain('2 x Kings');
      expect(faceDown).toContain('card-pattern');
      expect(faceDown).not.toContain('<img');
    });

    it('Toast: renders accessible notifications with 44px dismiss target', () => {
      const html = renderToStaticMarkup(
        <Toast id="t1" message="Code copied" type="info" onDismiss={vi.fn()} />
      );
      expect(html).toContain('Code copied');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Dismiss notification"');
      expect(html).toContain('min-h-[44px]');
    });
  });

  describe('How to Play Stepper (8 Steps)', () => {
    it('Step 1 (The goal): renders goal text, illustration, Skip and Next buttons', () => {
      const html = renderToStaticMarkup(<HowToPlayModal isOpen={true} onClose={vi.fn()} initialStep={0} />);
      expect(html).toContain('The goal');
      expect(html).toContain('Be the first player to get rid of all your cards.');
      expect(html).toContain('Step 1 of 8');
      expect(html).toContain('Next');
      expect(html).toContain('Skip');
    });

    it('Step 2 (Your turn): renders rank advance and cards claim rule with Back button', () => {
      const html = renderToStaticMarkup(<HowToPlayModal isOpen={true} onClose={vi.fn()} initialStep={1} />);
      expect(html).toContain('Your turn');
      expect(html).toContain('Only you can see your cards. The game shows a rank for this turn, like Kings.');
      expect(html).toContain("The rank goes up each turn: Aces, 2s, 3s... Kings, then back to Aces.");
      expect(html).toContain('Step 2 of 8');
      expect(html).toContain('Back');
      expect(html).toContain('Next');
    });

    it('Step 3 (You can lie): renders bluff explanation and 2 face-down cards labelled 2 x Kings', () => {
      const html = renderToStaticMarkup(<HowToPlayModal isOpen={true} onClose={vi.fn()} initialStep={2} />);
      expect(html).toContain('You can lie');
      expect(html.replace(/&#x27;/g, "'")).toContain("Your cards don't have to match! If the rank is Kings, you can play a 5 and pretend it's a King. That is a bluff.");
      expect(html).toContain('2 x Kings');
    });

    it('Step 4 (Call bluff): renders challenge rule and card flip animation illustration', () => {
      const html = renderToStaticMarkup(<HowToPlayModal isOpen={true} onClose={vi.fn()} initialStep={3} />);
      expect(html).toContain('Call bluff');
      expect(html).toContain('Think someone lied? Tap Call bluff right after they play, before the next player plays. Anyone except the player who just played can call. The cards flip over.');
      expect(html).toContain('animate-flip');
    });

    it('Step 5 (Who picks up the pile): renders truthful vs bluff pickup rules', () => {
      const html = renderToStaticMarkup(<HowToPlayModal isOpen={true} onClose={vi.fn()} initialStep={4} />);
      expect(html).toContain('Who picks up the pile');
      expect(html).toContain('They lied? They take the whole pile. They told the truth? You take the whole pile. Whoever wins the call plays next.');
    });

    it('Step 6 (Winning): renders 10 seconds final call challenge rule', () => {
      const html = renderToStaticMarkup(<HowToPlayModal isOpen={true} onClose={vi.fn()} initialStep={5} />);
      expect(html).toContain('Winning');
      expect(html).toContain('Play your last card to win. Everyone then gets 10 seconds to call bluff on it. If nobody does, you win!');
      expect(html).toContain('10s');
    });

    it('Step 7 (Example): renders Rohan and Meera example story with revealed cards', () => {
      const html = renderToStaticMarkup(<HowToPlayModal isOpen={true} onClose={vi.fn()} initialStep={6} />);
      expect(html).toContain('Example');
      expect(html.replace(/&#x27;/g, "'")).toContain("Rohan plays 3 cards and says '3 x Fives'. Meera isn't sure and taps Call bluff. The cards flip: 5, 5 and a Queen. Rohan lied, so he picks up the whole pile. Meera plays next.");
    });

    it('Step 8 (Tips): renders card counting tips and "Got it" button instead of "Next"', () => {
      const html = renderToStaticMarkup(<HowToPlayModal isOpen={true} onClose={vi.fn()} initialStep={7} />);
      expect(html).toContain('Tips');
      expect(html).toContain('Bluff sometimes, not every turn. Count cards: if you hold 3 Kings and someone plays 4 Kings, they are lying. Watch players who have few cards left.');
      expect(html).toContain('Got it');
      expect(html).not.toContain('>Next<');
    });
  });

  describe('Landing Screen & Join Code Modal', () => {
    it('renders BLUFF logo, 4-card fan with idle float, action buttons, and footer chips', () => {
      const html = renderToStaticMarkup(
        <LandingScreen
          initialName="Alice"
          onCreateRoom={vi.fn()}
          onJoinRoom={vi.fn()}
          onErrorToast={vi.fn()}
        />
      );

      expect(html).toContain('BLUFF');
      expect(html).toContain('animate-idle-float');
      expect(html).toContain('Create room');
      expect(html).toContain('Join with code');
      expect(html).toContain('How to play');
      expect(html).toContain('Guests welcome');
      expect(html).toContain('No download');
      expect(html).toContain('Play with friends anywhere');
    });

    it('first-visit nudge: displays only on first visit and stays hidden after being set in localStorage', () => {
      // First visit: bluff_has_visited not set
      delete storageMock['bluff_has_visited'];
      const firstHtml = renderToStaticMarkup(
        <LandingScreen
          initialName="Rohan"
          onCreateRoom={vi.fn()}
          onJoinRoom={vi.fn()}
          onErrorToast={vi.fn()}
        />
      );
      expect(firstHtml).toContain('New here? Learn in 30 seconds');

      // Return visit: bluff_has_visited is 'true'
      storageMock['bluff_has_visited'] = 'true';
      const returnHtml = renderToStaticMarkup(
        <LandingScreen
          initialName="Rohan"
          onCreateRoom={vi.fn()}
          onJoinRoom={vi.fn()}
          onErrorToast={vi.fn()}
        />
      );
      expect(returnHtml).not.toContain('New here? Learn in 30 seconds');
    });

    it('prefills room code from URL and opens Join Sheet with 6-char input', () => {
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
        localStorage: global.localStorage,
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
      expect(html).toContain('Join Room');
    });
  });

  describe('Lobby Screen', () => {
    const mockRoomView: RoomView = {
      roomCode: 'WXYZ89',
      hostId: 'host-1',
      status: 'LOBBY',
      players: [
        { playerId: 'host-1', name: 'Rohan', connected: true },
        { playerId: 'player-2', name: 'Meera', connected: true },
      ],
      settings: { cardsPerPlayer: 10 },
    };

    it('renders room code card with copy and share buttons', () => {
      const html = renderToStaticMarkup(
        <LobbyScreen
          roomView={mockRoomView}
          currentPlayerId="host-1"
          isSocketConnected={true}
          onLeaveRoom={vi.fn()}
          onUpdateSettings={vi.fn()}
          onStartGame={vi.fn()}
          onInfoToast={vi.fn()}
          onErrorToast={vi.fn()}
        />
      );

      expect(html).toContain('WXYZ89');
      expect(html).toContain('Share Room Code');
      expect(html).toContain('Copy code');
    });

    it('renders players list as seats with avatars, host crown, connection dots, and dashed waiting seats', () => {
      const html = renderToStaticMarkup(
        <LobbyScreen
          roomView={mockRoomView}
          currentPlayerId="host-1"
          isSocketConnected={true}
          onLeaveRoom={vi.fn()}
          onUpdateSettings={vi.fn()}
          onStartGame={vi.fn()}
          onInfoToast={vi.fn()}
          onErrorToast={vi.fn()}
        />
      );

      expect(html).toContain('2/8 players');
      expect(html).toContain('Rohan');
      expect(html).toContain('Meera');
      expect(html).toContain('Host');
      expect(html).toContain('You');
      // 6 empty seats out of 8 should show "Waiting..."
      expect(html).toContain('Waiting...');
    });

    it('Start Game button is disabled with "Need at least 2 players" when room has only 1 player', () => {
      const singlePlayerRoom: RoomView = {
        ...mockRoomView,
        players: [{ playerId: 'host-1', name: 'Solo', connected: true }],
      };

      const html = renderToStaticMarkup(
        <LobbyScreen
          roomView={singlePlayerRoom}
          currentPlayerId="host-1"
          isSocketConnected={true}
          onLeaveRoom={vi.fn()}
          onUpdateSettings={vi.fn()}
          onStartGame={vi.fn()}
          onInfoToast={vi.fn()}
          onErrorToast={vi.fn()}
        />
      );

      expect(html).toContain('Need at least 2 players');
      expect(html).toContain('disabled=""');
    });

    it('non-host player sees "Waiting for the host to start"', () => {
      const html = renderToStaticMarkup(
        <LobbyScreen
          roomView={mockRoomView}
          currentPlayerId="player-2"
          isSocketConnected={true}
          onLeaveRoom={vi.fn()}
          onUpdateSettings={vi.fn()}
          onStartGame={vi.fn()}
          onInfoToast={vi.fn()}
          onErrorToast={vi.fn()}
        />
      );

      expect(html).toContain('Waiting for the host to start');
      expect(html).not.toContain('Deal &amp; Start Game');
    });
  });
});
