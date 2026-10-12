import React, { useMemo } from 'react';
import { PublicGameState, sortCards, Card, Suit } from '@bluff/shared';

interface GameScreenProps {
  gameState: PublicGameState;
  currentPlayerId: string;
  isSocketConnected: boolean;
  onLeaveRoom: () => void;
}

const SUIT_ICONS: Record<Suit, string> = {
  H: '♥',
  D: '♦',
  C: '♣',
  S: '♠',
};

const SUIT_COLORS: Record<Suit, string> = {
  H: 'text-rose-600',
  D: 'text-rose-600',
  C: 'text-slate-900',
  S: 'text-slate-900',
};

export const GameScreen: React.FC<GameScreenProps> = ({
  gameState,
  currentPlayerId,
  isSocketConnected,
  onLeaveRoom,
}) => {
  const sortedHand = useMemo(() => sortCards(gameState.myHand), [gameState.myHand]);

  const currentTurnPlayer = gameState.players.find(
    (p) => p.playerId === gameState.currentTurnId
  );
  const isMyTurn = gameState.currentTurnId === currentPlayerId;

  const opponents = gameState.players.filter((p) => p.playerId !== currentPlayerId);

  return (
    <div className="w-full max-w-[360px] mx-auto px-3 py-4 flex flex-col justify-between min-h-[640px] text-white">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isSocketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-xs font-medium text-slate-400">
              {isSocketConnected ? 'Connected' : 'Reconnecting...'}
            </span>
          </div>

          <button
            type="button"
            onClick={onLeaveRoom}
            className="text-xs font-semibold text-rose-400 hover:text-rose-300 active:text-rose-500 px-3 py-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 min-h-[44px] flex items-center justify-center transition-colors"
            style={{ touchAction: 'manipulation' }}
          >
            Leave
          </button>
        </div>

        {/* Required Rank Banner */}
        <div className="bg-gradient-to-r from-amber-600/30 via-indigo-600/30 to-amber-600/30 border border-amber-500/40 rounded-2xl p-3 text-center mb-3 shadow-lg">
          <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300 block mb-0.5">
            Claim Rank For Next Play
          </span>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-slate-300 font-medium">Claim must be:</span>
            <span className="font-mono text-3xl font-black text-amber-300 px-3 py-0.5 rounded-xl bg-amber-500/20 border border-amber-400/50 shadow-inner">
              {gameState.requiredRank}
            </span>
          </div>
        </div>

        {/* Turn Status Indicator */}
        <div
          className={`rounded-xl p-2.5 text-center text-xs font-bold mb-3 border transition-all ${
            isMyTurn
              ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 shadow-md ring-1 ring-emerald-500/30 animate-pulse'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
          }`}
        >
          {isMyTurn ? (
            <span>★ It&apos;s your turn!</span>
          ) : (
            <span>Turn: {currentTurnPlayer?.name ?? 'Opponent'}</span>
          )}
        </div>

        {/* Central Face-Down Pile */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-xl text-center mb-3">
          <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 block mb-2">
            Central Pile
          </span>

          <div className="flex flex-col items-center justify-center py-2">
            {/* Visual Stack of Cards */}
            <div className="relative w-20 h-28 flex items-center justify-center">
              {/* Stack effect layers */}
              <div className="absolute inset-0 bg-indigo-950 rounded-xl border border-indigo-500/30 rotate-6 translate-x-1 translate-y-1 opacity-70" />
              <div className="absolute inset-0 bg-indigo-900 rounded-xl border border-indigo-400/40 -rotate-3 -translate-x-1 translate-y-0.5 opacity-80" />
              {/* Top card back */}
              <div className="relative w-full h-full bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 rounded-xl border-2 border-indigo-400/60 shadow-lg flex flex-col items-center justify-center p-2">
                <div className="w-full h-full rounded-lg border border-indigo-400/30 flex flex-col items-center justify-center bg-indigo-950/40">
                  <span className="font-mono text-2xl font-black text-indigo-200">
                    {gameState.pile.count}
                  </span>
                  <span className="text-[9px] font-bold uppercase text-indigo-300">
                    Cards
                  </span>
                </div>
              </div>
            </div>

            {gameState.pile.lastPlay && (
              <div className="mt-3 text-xs text-slate-300 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700/60">
                Last play:{' '}
                <span className="font-bold text-amber-300">
                  {gameState.pile.lastPlay.count}x {gameState.pile.lastPlay.declaredRank}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Opponents List */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3 shadow-md mb-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Opponents
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {opponents.length} players
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {opponents.map((opponent) => {
              const isOpponentTurn = opponent.playerId === gameState.currentTurnId;

              return (
                <div
                  key={opponent.playerId}
                  className={`p-2 rounded-xl border flex flex-col justify-between transition-all ${
                    isOpponentTurn
                      ? 'bg-indigo-600/20 border-indigo-400/80 shadow-md ring-1 ring-indigo-400/40'
                      : 'bg-slate-800/80 border-slate-700/70'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-xs truncate text-slate-200">
                      {opponent.name}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        opponent.connected ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Cards:</span>
                    <span className="font-mono font-bold text-indigo-300 px-1.5 py-0.2 rounded bg-indigo-500/10 border border-indigo-500/20">
                      {opponent.handCount}
                    </span>
                  </div>

                  {isOpponentTurn && (
                    <span className="mt-1 text-[9px] font-bold text-indigo-400 uppercase tracking-wider text-center">
                      Playing now
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Your Hand (Bottom Section) */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3 shadow-xl">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Your Hand
          </span>
          <span className="text-xs font-bold font-mono text-indigo-300 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
            {sortedHand.length} cards
          </span>
        </div>

        {/* Scrollable / Wrapping Cards Hand */}
        <div
          tabIndex={0}
          aria-label="Your hand of cards"
          className="flex gap-2 overflow-x-auto pb-2 pt-1 px-0.5 max-h-[140px] flex-nowrap scrollbar-thin"
          style={{ touchAction: 'manipulation' }}
        >
          {sortedHand.map((card: Card) => {
            const icon = SUIT_ICONS[card.suit];
            const colorClass = SUIT_COLORS[card.suit];

            return (
              <div
                key={card.id}
                className="shrink-0 w-12 h-18 sm:w-14 sm:h-20 bg-white rounded-lg border-2 border-slate-300 shadow-md p-1 flex flex-col justify-between items-center select-none min-h-[44px] min-w-[44px] transition-transform"
              >
                <div className="w-full flex items-center justify-between leading-none">
                  <span className={`font-mono text-xs font-extrabold ${colorClass}`}>
                    {card.rank}
                  </span>
                  <span className={`text-[10px] leading-none ${colorClass}`}>
                    {icon}
                  </span>
                </div>

                <div className={`text-base font-bold ${colorClass} my-auto`}>
                  {icon}
                </div>

                <div className="w-full flex items-center justify-between leading-none rotate-180">
                  <span className={`font-mono text-xs font-extrabold ${colorClass}`}>
                    {card.rank}
                  </span>
                  <span className={`text-[10px] leading-none ${colorClass}`}>
                    {icon}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
