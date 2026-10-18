import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameScreen } from '../components/GameScreen';
import { PublicGameState, Card } from '@bluff/shared';

function createMockGameState(overrides?: Partial<PublicGameState>): PublicGameState {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const opponentId = '22222222-2222-4222-8222-222222222222';

  const defaultHand: Card[] = [
    { id: 'H-A', suit: 'H', rank: 'A' },
    { id: 'S-8', suit: 'S', rank: '8' },
    { id: 'D-J', suit: 'D', rank: 'J' },
  ];

  return {
    roomCode: 'ABCDEF',
    hostId: viewerId,
    status: 'PLAYING',
    settings: { cardsPerPlayer: 5 },
    players: [
      { playerId: viewerId, name: 'Viewer', connected: true, handCount: defaultHand.length },
      { playerId: opponentId, name: 'Opponent', connected: true, handCount: 5 },
    ],
    myHand: defaultHand,
    turnOrder: [viewerId, opponentId],
    currentTurnId: viewerId,
    requiredRank: '8',
    pile: {
      count: 2,
      lastPlay: {
        playSeq: 1,
        playerId: opponentId,
        declaredRank: '7',
        count: 1,
      },
    },
    playSeq: 1,
    serverNow: Date.now(),
    ...overrides,
  };
}

describe('Slice 6: UI Polish', () => {
  const noop = () => {};

  it('Hand layout: renders 15 cards wrapped with flex-wrap and no sideways scrollbar', () => {
    const cards15: Card[] = Array.from({ length: 15 }, (_, i) => ({
      id: `card-${i}`,
      suit: (['H', 'D', 'C', 'S'] as const)[i % 4],
      rank: (['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const)[i % 13],
    }));

    const state = createMockGameState({ myHand: cards15 });
    const html = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: state,
        currentPlayerId: state.players[0].playerId,
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );

    // Verifies flex-wrap is present and overflow-x-auto is absent
    expect(html).toContain('flex-wrap');
    expect(html).not.toContain('overflow-x-auto');
    expect(html).not.toContain('scrollbar-thin');

    // Verifies hand badge shows plural "15 cards"
    expect(html).toContain('15 cards');

    // Verifies all 15 cards exist and have touch target >= 44px (min-h-[44px] min-w-[44px])
    for (const card of cards15) {
      expect(html).toContain(`${card.rank} of ${card.suit}`);
    }
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('min-w-[44px]');
  });

  it('Grammar: singular "1 card" vs plural "N cards" on hand badge and pile', () => {
    // 1 card hand
    const state1Card = createMockGameState({
      myHand: [{ id: 'H-A', suit: 'H', rank: 'A' }],
      pile: { count: 1, lastPlay: null },
    });
    const html1Card = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: state1Card,
        currentPlayerId: state1Card.players[0].playerId,
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );

    expect(html1Card).toContain('1 card');
    expect(html1Card).not.toContain('1 cards');
    // Pile badge singular
    expect(html1Card).toContain('Card');
  });

  it('Grammar: Call Bluff button displays singular "(1 card)" on 1-card last play', () => {
    const state = createMockGameState({
      pile: {
        count: 1,
        lastPlay: {
          playSeq: 1,
          playerId: '22222222-2222-4222-8222-222222222222',
          declaredRank: 'K',
          count: 1,
        },
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: state,
        currentPlayerId: state.players[0].playerId,
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );

    expect(html).toContain('Call Bluff on Opponent (1 card)');
    expect(html).not.toContain('(1 cards)');
  });

  it('Grammar: Pickup announcement displays "(1 card)" on 1-card pickup', () => {
    const state = createMockGameState();
    const challengeResult = {
      playSeq: 1,
      challengerId: state.players[0].playerId,
      accusedId: state.players[1].playerId,
      declaredRank: '8' as const,
      revealedCards: [{ id: 'H-7', suit: 'H' as const, rank: '7' as const }],
      wasBluff: true,
      pickedUpById: state.players[1].playerId,
      pickedUpCount: 1,
    };

    const html = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: state,
        currentPlayerId: state.players[0].playerId,
        isSocketConnected: true,
        isHost: true,
        challengeResult,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );

    expect(html).toContain('picks up the whole pile (1 card)!');
    expect(html).not.toContain('(1 cards)!');
  });

  it('Call Bluff button: enabled on own turn when last play was not mine and pile not empty', () => {
    const state = createMockGameState({
      currentTurnId: '11111111-1111-4111-8111-111111111111', // Viewer's turn
      status: 'PLAYING',
      pile: {
        count: 2,
        lastPlay: {
          playSeq: 1,
          playerId: '22222222-2222-4222-8222-222222222222', // Opponent's play
          declaredRank: '7',
          count: 2,
        },
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: state,
        currentPlayerId: '11111111-1111-4111-8111-111111111111',
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );

    // Call Bluff button must not be disabled
    expect(html).toContain('Call Bluff on Opponent (2 cards)');
    expect(html).toContain('bg-rose-600');
  });

  it('Call Bluff button: clearly shows disabled reasons when challenge is not allowed', () => {
    // 1. Pile empty
    const emptyState = createMockGameState({
      pile: { count: 0, lastPlay: null },
    });
    const emptyHtml = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: emptyState,
        currentPlayerId: '11111111-1111-4111-8111-111111111111',
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );
    expect(emptyHtml).toContain('Call Bluff (Pile Empty)');

    // 2. Last play was mine
    const myPlayState = createMockGameState({
      pile: {
        count: 1,
        lastPlay: {
          playSeq: 1,
          playerId: '11111111-1111-4111-8111-111111111111', // Mine
          declaredRank: 'A',
          count: 1,
        },
      },
    });
    const myPlayHtml = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: myPlayState,
        currentPlayerId: '11111111-1111-4111-8111-111111111111',
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );
    expect(myPlayHtml).toContain('Call Bluff (Your Play)');
  });

  it('Game over screen: shows exact required copy for winner and non-winner', () => {
    // 1. Viewer won
    const winnerState = createMockGameState({
      status: 'GAME_OVER',
      winnerId: '11111111-1111-4111-8111-111111111111',
    });
    const winnerHtml = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: winnerState,
        currentPlayerId: '11111111-1111-4111-8111-111111111111',
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );
    expect(winnerHtml).toContain('You won!');
    expect(winnerHtml).toContain('You emptied your hand and survived the final call!');

    // 2. Opponent won
    const loserState = createMockGameState({
      status: 'GAME_OVER',
      winnerId: '22222222-2222-4222-8222-222222222222',
    });
    const loserHtml = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: loserState,
        currentPlayerId: '11111111-1111-4111-8111-111111111111',
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );
    expect(loserHtml).toContain('Opponent wins!');
    expect(loserHtml).toContain('Opponent emptied their hand and survived the final call!');
  });

  it('Phone layout: includes safe area bottom padding and compact button heights', () => {
    const state = createMockGameState();
    const html = renderToStaticMarkup(
      React.createElement(GameScreen, {
        gameState: state,
        currentPlayerId: state.players[0].playerId,
        isSocketConnected: true,
        isHost: true,
        challengeResult: null,
        onDismissChallengeResult: noop,
        onLeaveRoom: noop,
        onPlayTurn: noop,
        onCallBluff: noop,
        onPlayAgain: noop,
      })
    );

    // Fixed bottom bar has safe area padding
    expect(html).toContain('env(safe-area-inset-bottom');

    // Page container has bottom padding to prevent content from hiding under fixed bar
    expect(html).toContain('calc(140px + env(safe-area-inset-bottom, 0px))');

    // Compact buttons (~48px each: h-12 min-h-[48px])
    expect(html).toContain('h-12 min-h-[48px]');
  });
});
