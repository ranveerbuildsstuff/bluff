import React, { useMemo, useState, useEffect } from 'react';
import {
  PublicGameState,
  sortCards,
  Card,
  Suit,
  rankLabel,
  rankWithArticle,
  cardCountLabel,
  cardsWord,
  ChallengeResult,
} from '@bluff/shared';

interface GameScreenProps {
  gameState: PublicGameState;
  currentPlayerId: string;
  isSocketConnected: boolean;
  isHost: boolean;
  challengeResult: ChallengeResult | null;
  onDismissChallengeResult: () => void;
  onLeaveRoom: () => void;
  onPlayTurn: (cardIds: string[]) => void;
  onCallBluff: (playSeq: number) => void;
  onPlayAgain: () => void;
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
  isHost,
  challengeResult,
  onDismissChallengeResult,
  onLeaveRoom,
  onPlayTurn,
  onCallBluff,
  onPlayAgain,
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [isCallingBluff, setIsCallingBluff] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [pausedSeconds, setPausedSeconds] = useState<number | null>(null);

  // Clear selection after a successful play or status change
  useEffect(() => {
    setSelectedCardIds([]);
    setIsCallingBluff(false);
  }, [gameState.playSeq, gameState.status, gameState.pile.count, challengeResult]);

  // Safety timeout so isCallingBluff never remains stuck if server rejects or times out
  useEffect(() => {
    if (!isCallingBluff) return;
    const timer = setTimeout(() => setIsCallingBluff(false), 5000);
    return () => clearTimeout(timer);
  }, [isCallingBluff]);

  // Purge any selected cards that are no longer in myHand
  useEffect(() => {
    const handCardIds = new Set(gameState.myHand.map((c) => c.id));
    setSelectedCardIds((prev) => prev.filter((id) => handCardIds.has(id)));
  }, [gameState.myHand]);

  // Auto-dismiss reveal overlay after ~3.5 seconds
  useEffect(() => {
    if (!challengeResult) return;
    setFlipped(false);
    const flipTimer = setTimeout(() => setFlipped(true), 150);
    const dismissTimer = setTimeout(() => {
      onDismissChallengeResult();
    }, 3500);

    return () => {
      clearTimeout(flipTimer);
      clearTimeout(dismissTimer);
    };
  }, [challengeResult, onDismissChallengeResult]);

  // FINAL_CALL countdown using serverNow offset
  useEffect(() => {
    if (gameState.status !== 'FINAL_CALL' || !gameState.finalCallDeadline) {
      setRemainingSeconds(null);
      return;
    }

    const serverOffset = gameState.serverNow - Date.now();

    const updateTimer = () => {
      const currentServerTime = Date.now() + serverOffset;
      const remainingMs = (gameState.finalCallDeadline as number) - currentServerTime;
      const sec = Math.max(0, Math.ceil(remainingMs / 1000));
      setRemainingSeconds(sec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [gameState.status, gameState.finalCallDeadline, gameState.serverNow]);

  // PAUSED countdown using serverNow offset
  useEffect(() => {
    if (gameState.status !== 'PAUSED' || !gameState.rejoinDeadline) {
      setPausedSeconds(null);
      return;
    }

    const serverOffset = gameState.serverNow - Date.now();

    const updateTimer = () => {
      const currentServerTime = Date.now() + serverOffset;
      const remainingMs = (gameState.rejoinDeadline as number) - currentServerTime;
      const sec = Math.max(0, Math.ceil(remainingMs / 1000));
      setPausedSeconds(sec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [gameState.status, gameState.rejoinDeadline, gameState.serverNow]);

  const sortedHand = useMemo(() => sortCards(gameState.myHand), [gameState.myHand]);

  const currentTurnPlayer = gameState.players.find(
    (p) => p.playerId === gameState.currentTurnId
  );
  const isMyTurn =
    gameState.currentTurnId === currentPlayerId && gameState.status === 'PLAYING';

  const opponents = gameState.players.filter((p) => p.playerId !== currentPlayerId);

  const lastPlay = gameState.pile.lastPlay;
  const lastPlayPlayer = lastPlay
    ? gameState.players.find((p) => p.playerId === lastPlay.playerId)
    : null;
  const lastPlayPlayerName = lastPlayPlayer ? lastPlayPlayer.name : 'Someone';

  const hasLastPlay = gameState.pile.count > 0 && lastPlay !== null;
  const isLastPlayMine = lastPlay?.playerId === currentPlayerId;
  const isCallBluffEligible =
    hasLastPlay &&
    !isLastPlayMine &&
    (gameState.status === 'PLAYING' || gameState.status === 'FINAL_CALL');

  const canCallBluff = isCallBluffEligible && !isCallingBluff;

  const callBluffLabel = useMemo(() => {
    if (isCallingBluff) return 'Calling Bluff...';
    if (!hasLastPlay) return 'Call Bluff (Pile Empty)';
    if (isLastPlayMine) return 'Call Bluff (Your Play)';
    if (gameState.status === 'PAUSED') return 'Call Bluff (Paused)';
    if (gameState.status === 'GAME_OVER') return 'Call Bluff (Game Over)';
    return `Call Bluff on ${lastPlayPlayerName} (${lastPlay ? cardCountLabel(lastPlay.count) : ''})`;
  }, [
    isCallingBluff,
    hasLastPlay,
    isLastPlayMine,
    gameState.status,
    lastPlayPlayerName,
    lastPlay,
  ]);

  const toggleCardSelection = (cardId: string) => {
    setSelectedCardIds((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, cardId];
    });
  };

  const selectedCount = selectedCardIds.length;
  const canPlay = isMyTurn && selectedCount >= 1 && selectedCount <= 4;

  const handlePlayClick = () => {
    if (canPlay) {
      onPlayTurn(selectedCardIds);
    }
  };

  const handleCallBluffClick = () => {
    if (canCallBluff && lastPlay) {
      setIsCallingBluff(true);
      onCallBluff(lastPlay.playSeq);
    }
  };

  const winnerPlayer = gameState.players.find((p) => p.playerId === gameState.winnerId);

  return (
    <div
      className="w-full max-w-[360px] mx-auto px-3 pt-3 text-white relative flex flex-col justify-between"
      style={{
        paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Top Header & Connection */}
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

        {/* Final Call Banner with Countdown */}
        {gameState.status === 'FINAL_CALL' && (
          <div className="bg-gradient-to-r from-red-600/40 via-amber-600/40 to-red-600/40 border-2 border-red-500/70 rounded-2xl p-3 text-center mb-3 shadow-xl">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-xs font-black text-red-300 uppercase tracking-widest animate-pulse">
                🚨 FINAL CALL
              </span>
              {remainingSeconds !== null && (
                <span className="font-mono text-sm font-black text-amber-300 px-2 py-0.5 rounded-md bg-black/50 border border-amber-400/50 shadow-inner">
                  {remainingSeconds}s left
                </span>
              )}
            </div>
            <p className="text-xs text-slate-200">
              <strong className="text-amber-300 font-bold">
                {winnerPlayer?.name ?? 'A player'}
              </strong>{' '}
              played all their cards! Call bluff before the timer expires or they win!
            </p>
          </div>
        )}

        {/* Required Rank Banner */}
        <div className="bg-gradient-to-r from-amber-600/30 via-indigo-600/30 to-amber-600/30 border border-amber-500/40 rounded-2xl p-3 text-center mb-3 shadow-lg">
          <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300 block mb-0.5">
            Claim Rank For Next Play
          </span>
          <div className="flex items-center justify-center gap-2.5">
            <span className="text-sm text-slate-200 font-semibold">
              Claim must be:{' '}
              <span className="text-amber-300 font-bold">
                {rankLabel(gameState.requiredRank, 2)}
              </span>
            </span>
            <span className="font-mono text-2xl font-black text-amber-300 px-2.5 py-0.5 rounded-xl bg-amber-500/20 border border-amber-400/50 shadow-inner">
              {gameState.requiredRank}
            </span>
          </div>
        </div>

        {/* Turn Status Indicator */}
        <div
          className={`rounded-xl p-2.5 text-center text-xs font-bold mb-3 border transition-all ${
            isMyTurn
              ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-300 shadow-md ring-2 ring-emerald-500/40 animate-pulse'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
          }`}
        >
          {gameState.status === 'FINAL_CALL' ? (
            <span className="text-amber-300 tracking-wide">
              Final Call in progress — Call Bluff now!
            </span>
          ) : isMyTurn ? (
            <span className="text-sm font-black tracking-wide">
              ★ YOUR TURN — Select 1 to 4 cards
            </span>
          ) : (
            <span>Turn: {currentTurnPlayer?.name ?? 'Opponent'}</span>
          )}
        </div>

        {/* Central Face-Down Pile */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-xl text-center mb-3">
          <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 block mb-2">
            Central Pile
          </span>

          <div className="flex flex-col items-center justify-center py-1">
            {/* Visual Stack of Cards */}
            <div className="relative w-20 h-28 flex items-center justify-center">
              <div className="absolute inset-0 bg-indigo-950 rounded-xl border border-indigo-500/30 rotate-6 translate-x-1 translate-y-1 opacity-70" />
              <div className="absolute inset-0 bg-indigo-900 rounded-xl border border-indigo-400/40 -rotate-3 -translate-x-1 translate-y-0.5 opacity-80" />
              <div className="relative w-full h-full bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 rounded-xl border-2 border-indigo-400/60 shadow-lg flex flex-col items-center justify-center p-2">
                <div className="w-full h-full rounded-lg border border-indigo-400/30 flex flex-col items-center justify-center bg-indigo-950/40">
                  <span className="font-mono text-2xl font-black text-indigo-200">
                    {gameState.pile.count}
                  </span>
                  <span className="text-[9px] font-bold uppercase text-indigo-300">
                    {cardsWord(gameState.pile.count)}
                  </span>
                </div>
              </div>
            </div>

            {/* Pile Last Play Announcement */}
            {lastPlay ? (
              <div className="mt-3 text-xs text-slate-200 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700/80 shadow-inner">
                <span className="font-semibold text-indigo-300">
                  {lastPlayPlayerName}
                </span>{' '}
                played{' '}
                <span className="font-bold text-amber-300 font-mono">
                  {lastPlay.count} x {rankLabel(lastPlay.declaredRank, lastPlay.count)}
                </span>
              </div>
            ) : (
              <div className="mt-3 text-xs text-slate-400 italic">
                Central pile is empty
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

      {/* Your Hand */}
      <div className="flex flex-col mt-auto">
        {/* Hand container */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-2.5 shadow-xl mt-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Your Hand
              </span>
              {selectedCount > 0 && (
                <span className="text-[11px] font-semibold text-amber-300">
                  ({selectedCount}/4 selected)
                </span>
              )}
            </div>
            <span className="text-xs font-bold font-mono text-indigo-300 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
              {cardCountLabel(sortedHand.length)}
            </span>
          </div>

          {/* Cards Hand: Wrapping rows, no sideways scroll, lifted cards not clipped */}
          <div
            tabIndex={0}
            aria-label="Your hand of cards"
            className="flex flex-wrap gap-1.5 sm:gap-2 gap-y-3 justify-center pt-3.5 pb-1 px-0.5"
            style={{ touchAction: 'manipulation' }}
          >
            {sortedHand.length === 0 ? (
              <div className="w-full text-center py-4 text-xs font-semibold text-amber-300 italic">
                No cards remaining in hand
              </div>
            ) : (
              sortedHand.map((card: Card) => {
                const icon = SUIT_ICONS[card.suit];
                const colorClass = SUIT_COLORS[card.suit];
                const isSelected = selectedCardIds.includes(card.id);

                return (
                  <button
                    type="button"
                    key={card.id}
                    onClick={() => toggleCardSelection(card.id)}
                    aria-pressed={isSelected}
                    aria-label={`${card.rank} of ${card.suit}${
                      isSelected ? ', selected' : ''
                    }`}
                    className={`w-[54px] h-[72px] sm:w-[58px] sm:h-[76px] bg-white rounded-lg border-2 shadow-md p-1 flex flex-col justify-between items-center select-none min-h-[44px] min-w-[44px] transition-all transform cursor-pointer ${
                      isSelected
                        ? 'relative z-10 -translate-y-2.5 border-amber-400 ring-2 ring-amber-400 shadow-amber-500/40 shadow-lg bg-amber-50'
                        : 'border-slate-300 hover:border-slate-400 active:scale-95'
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="w-full flex items-center justify-between leading-none pointer-events-none">
                      <span className={`font-mono text-xs font-extrabold ${colorClass}`}>
                        {card.rank}
                      </span>
                      <span className={`text-[10px] leading-none ${colorClass}`}>
                        {icon}
                      </span>
                    </div>

                    <div
                      className={`text-base font-bold ${colorClass} my-auto pointer-events-none`}
                    >
                      {icon}
                    </div>

                    <div className="w-full flex items-center justify-between leading-none rotate-180 pointer-events-none">
                      <span className={`font-mono text-xs font-extrabold ${colorClass}`}>
                        {card.rank}
                      </span>
                      <span className={`text-[10px] leading-none ${colorClass}`}>
                        {icon}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Action Area */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800"
        style={{
          paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
        }}
      >
        <div className="w-full max-w-[360px] mx-auto px-3 pt-2 flex flex-col gap-2">
          {/* Call Bluff Button: ~48px compact */}
          <button
            type="button"
            disabled={!canCallBluff}
            onClick={handleCallBluffClick}
            className={`w-full h-12 min-h-[48px] px-3 rounded-xl font-bold text-sm tracking-wide transition-all flex items-center justify-center shadow-lg ${
              canCallBluff
                ? 'bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white shadow-rose-600/30 ring-2 ring-rose-400 cursor-pointer animate-pulse'
                : 'bg-slate-800/80 border border-slate-700/60 text-slate-500 cursor-not-allowed opacity-60'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            {callBluffLabel}
          </button>

          {/* Play Cards Action (only in PLAYING state): ~48px compact */}
          {gameState.status === 'PLAYING' && (
            <button
              type="button"
              disabled={!canPlay}
              onClick={handlePlayClick}
              className={`w-full h-12 min-h-[48px] px-3 rounded-xl font-bold text-sm tracking-wide transition-all flex items-center justify-center shadow-md ${
                canPlay
                  ? 'bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-slate-950 shadow-amber-500/25 ring-2 ring-amber-300 cursor-pointer'
                  : 'bg-slate-800/80 border border-slate-700/60 text-slate-400 cursor-not-allowed opacity-80'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              {selectedCount > 0 ? (
                selectedCount === 1 ? (
                  <span>
                    Play 1 card as{' '}
                    <span className="font-extrabold">
                      {rankWithArticle(gameState.requiredRank)}
                    </span>
                  </span>
                ) : (
                  <span>
                    Play {selectedCount} cards as{' '}
                    <span className="font-extrabold">
                      {rankLabel(gameState.requiredRank, selectedCount)}
                    </span>
                  </span>
                )
              ) : (
                <span>
                  {isMyTurn
                    ? `Select 1–4 cards to play as ${rankLabel(gameState.requiredRank, 2)}`
                    : `Waiting for ${currentTurnPlayer?.name ?? 'turn'}...`}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Reveal Overlay (Flip cards, Bluff/Truthful, who picks up) */}
      {challengeResult && (
        <div
          role="dialog"
          aria-label="Challenge Result"
          onClick={onDismissChallengeResult}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-pointer select-none"
          style={{ touchAction: 'manipulation' }}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onDismissChallengeResult();
            }}
            className={`w-full max-w-[340px] rounded-3xl border-2 p-5 text-center shadow-2xl flex flex-col items-center gap-3 transition-all ${
              challengeResult.wasBluff
                ? 'bg-gradient-to-b from-red-950/90 to-slate-900 border-red-500/80 shadow-red-500/20'
                : 'bg-gradient-to-b from-emerald-950/90 to-slate-900 border-emerald-500/80 shadow-emerald-500/20'
            }`}
          >
            {/* Banner */}
            <div
              className={`px-4 py-1.5 rounded-full text-sm font-black tracking-widest uppercase border shadow-md ${
                challengeResult.wasBluff
                  ? 'bg-red-500 text-white border-red-300 shadow-red-500/40'
                  : 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-emerald-500/40'
              }`}
            >
              {challengeResult.wasBluff ? '🚨 BLUFF! 🚨' : '✓ TRUTHFUL! ✓'}
            </div>

            {/* Narrative */}
            <div className="text-xs text-slate-200">
              <span className="font-bold text-white">
                {gameState.players.find(
                  (p) => p.playerId === challengeResult.challengerId
                )?.name ?? 'Challenger'}
              </span>{' '}
              called bluff on{' '}
              <span className="font-bold text-white">
                {gameState.players.find((p) => p.playerId === challengeResult.accusedId)
                  ?.name ?? 'Accused'}
              </span>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Claimed:{' '}
                <span className="font-bold text-amber-300 font-mono">
                  {challengeResult.revealedCards.length} x{' '}
                  {rankLabel(
                    challengeResult.declaredRank,
                    challengeResult.revealedCards.length
                  )}
                </span>
              </div>
            </div>

            {/* Revealed Cards Flip Area */}
            <div className="flex items-center justify-center gap-2 py-2 flex-wrap">
              {challengeResult.revealedCards.map((card) => {
                const icon = SUIT_ICONS[card.suit];
                const colorClass = SUIT_COLORS[card.suit];

                return (
                  <div
                    key={card.id}
                    className="relative w-14 h-20 sm:w-16 sm:h-22"
                    style={{ perspective: '1000px' }}
                  >
                    <div
                      className="relative w-full h-full transition-transform duration-700"
                      style={{
                        transformStyle: 'preserve-3d',
                        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                      }}
                    >
                      {/* Back */}
                      <div
                        className="absolute inset-0 w-full h-full rounded-xl border-2 border-indigo-400 bg-gradient-to-br from-indigo-700 via-indigo-900 to-slate-900 flex items-center justify-center p-1 shadow-lg"
                        style={{ backfaceVisibility: 'hidden' }}
                      >
                        <div className="w-full h-full rounded-lg border border-indigo-300/40 bg-indigo-950/60 flex items-center justify-center">
                          <span className="text-xl">🂠</span>
                        </div>
                      </div>

                      {/* Front (flipped) */}
                      <div
                        className="absolute inset-0 w-full h-full rounded-xl border-2 border-slate-300 bg-white p-1 flex flex-col justify-between items-center shadow-xl"
                        style={{
                          backfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)',
                        }}
                      >
                        <div className="w-full flex items-center justify-between leading-none pointer-events-none">
                          <span className={`font-mono text-xs font-black ${colorClass}`}>
                            {card.rank}
                          </span>
                          <span className={`text-[10px] leading-none ${colorClass}`}>
                            {icon}
                          </span>
                        </div>
                        <div
                          className={`text-base font-bold ${colorClass} my-auto pointer-events-none`}
                        >
                          {icon}
                        </div>
                        <div className="w-full flex items-center justify-between leading-none rotate-180 pointer-events-none">
                          <span className={`font-mono text-xs font-black ${colorClass}`}>
                            {card.rank}
                          </span>
                          <span className={`text-[10px] leading-none ${colorClass}`}>
                            {icon}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pickup Announcement */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200">
              <span className="font-extrabold text-amber-300">
                {gameState.players.find(
                  (p) => p.playerId === challengeResult.pickedUpById
                )?.name ?? 'Loser'}
              </span>{' '}
              picks up the whole pile ({cardCountLabel(challengeResult.pickedUpCount)})!
            </div>

            <span className="text-[10px] text-slate-400 tracking-wider uppercase mt-1 animate-pulse">
              Tap anywhere to dismiss
            </span>
          </div>
        </div>
      )}

      {/* Paused Overlay */}
      {gameState.status === 'PAUSED' && (
        <div
          role="dialog"
          aria-label="Game Paused"
          className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none"
        >
          <div className="w-full max-w-[340px] bg-slate-900 border-2 border-amber-500/70 rounded-3xl p-6 text-center shadow-2xl flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-2xl animate-pulse">
              ⏸️
            </div>
            <h3 className="text-lg font-black text-amber-300 tracking-wide">
              GAME PAUSED
            </h3>
            <p className="text-sm text-slate-100 font-bold">
              Waiting for {gameState.players.find((p) => !p.connected)?.name ?? 'Player'} to reconnect ({pausedSeconds !== null ? pausedSeconds : 60}s)
            </p>
            <p className="text-xs text-slate-400">
              The game will automatically resume once all players are back.
            </p>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.status === 'GAME_OVER' && (
        <div className="fixed inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[340px] bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-6 text-center shadow-2xl flex flex-col items-center gap-4">
            {gameState.endedReason === 'PLAYER_ABANDONED' ? (
              <>
                <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center text-3xl shadow-lg">
                  🚪
                </div>
                <div>
                  <h2 className="text-xl font-black text-rose-300 tracking-wider">
                    GAME OVER
                  </h2>
                  <p className="text-base text-slate-100 font-bold mt-2">
                    Game ended: {gameState.abandonedPlayerName || gameState.players.find((p) => !p.connected)?.name || 'Player'} didn't come back
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    The reconnection grace period expired.
                  </p>
                </div>

                <div className="w-full flex flex-col gap-2.5 mt-2">
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="w-full py-3.5 px-4 rounded-xl font-black text-sm tracking-wide bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white shadow-lg shadow-rose-600/25 ring-2 ring-rose-400 min-h-[48px] flex items-center justify-center transition-all cursor-pointer"
                    style={{ touchAction: 'manipulation' }}
                  >
                    Leave
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-lg">
                  🏆
                </div>
                <div>
                  <h2 className="text-2xl font-black text-amber-300 tracking-wider">
                    {winnerPlayer?.playerId === currentPlayerId
                      ? 'You won!'
                      : `${winnerPlayer?.name ?? 'Opponent'} wins!`}
                  </h2>
                  <p className="text-sm text-slate-100 font-medium mt-1">
                    {winnerPlayer?.playerId === currentPlayerId
                      ? 'You emptied your hand and survived the final call!'
                      : `${winnerPlayer?.name ?? 'Opponent'} emptied their hand and survived the final call!`}
                  </p>
                </div>

                <div className="w-full flex flex-col gap-2.5 mt-2">
                  {isHost ? (
                    <button
                      type="button"
                      onClick={onPlayAgain}
                      className="w-full py-3.5 px-4 rounded-xl font-black text-sm tracking-wide bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-300 min-h-[48px] flex items-center justify-center cursor-pointer transition-all"
                      style={{ touchAction: 'manipulation' }}
                    >
                      Play Again
                    </button>
                  ) : (
                    <div className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800/80 border border-slate-700 text-center">
                      Waiting for host to start a new game...
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="w-full py-3 px-4 rounded-xl font-bold text-xs text-rose-400 hover:text-rose-300 active:scale-[0.98] bg-rose-500/10 border border-rose-500/30 min-h-[44px] flex items-center justify-center transition-all"
                    style={{ touchAction: 'manipulation' }}
                  >
                    Leave Room
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
