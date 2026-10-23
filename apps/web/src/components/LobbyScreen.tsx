import React, { useState } from 'react';
import {
  RoomView,
  maxCardsPerPlayer,
  recommendedCardsPerPlayer,
  pluralize,
  buildRoomLink,
} from '@bluff/shared';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { Avatar } from '../ui/Avatar';
import { AccountButton } from './AccountButton';
import { HowToPlayModal } from './HowToPlayModal';

interface LobbyScreenProps {
  roomView: RoomView;
  currentPlayerId: string;
  isSocketConnected: boolean;
  onLeaveRoom: () => void;
  onUpdateSettings: (cardsPerPlayer: number) => void;
  onStartGame: () => void;
  onInfoToast: (message: string) => void;
  onErrorToast: (message: string) => void;
  isAccountsEnabled?: boolean;
  isSignedIn?: boolean;
  accountDisplayName?: string | null;
  onOpenAccount?: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  roomView,
  currentPlayerId,
  isSocketConnected,
  onLeaveRoom,
  onUpdateSettings,
  onStartGame,
  onInfoToast,
  onErrorToast,
  isAccountsEnabled = false,
  isSignedIn = false,
  accountDisplayName = null,
  onOpenAccount,
}) => {
  const [isConfirmLeaveOpen, setIsConfirmLeaveOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);

  const isHost = roomView.hostId === currentPlayerId;
  const playerCount = roomView.players.length;
  const maxAllowed = maxCardsPerPlayer(playerCount);
  const recommended = recommendedCardsPerPlayer(playerCount);
  const currentCards = roomView.settings.cardsPerPlayer;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const shareUrl = buildRoomLink(origin, roomView.roomCode);
  const shareText = `Join my Bluff game! Room code: ${roomView.roomCode}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Bluff Card Game',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        onInfoToast('Link copied');
        return;
      } catch {
        onErrorToast('Failed to copy to clipboard');
      }
    } else {
      onInfoToast(`Join link: ${shareUrl}`);
    }
  };

  const handleCopyCode = async () => {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(roomView.roomCode);
        onInfoToast('Code copied');
        return;
      } catch {
        onErrorToast('Failed to copy to clipboard');
      }
    } else {
      onInfoToast(`Room Code: ${roomView.roomCode}`);
    }
  };

  const presets = [5, 7, 10];
  const maxSeats = 8;
  const emptySeatsCount = Math.max(0, maxSeats - playerCount);

  return (
    <div className="w-full max-w-app mx-auto px-4 py-4 sm:py-6 flex flex-col justify-between min-h-[100dvh]">
      <div>
        {/* Top Bar: Connection, Account, How to Play, Leave Lobby */}
        <header className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Live Connection Dot */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#221440] border border-[rgba(167,139,250,0.18)] shrink-0">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSocketConnected ? 'bg-[#22C55E] animate-pulse' : 'bg-[#A89BC8]'
                }`}
              />
              <span className="text-[11px] font-semibold text-[#A89BC8]">
                {isSocketConnected ? 'Connected' : 'Reconnecting...'}
              </span>
            </div>

            {/* Account Profile Button */}
            {isAccountsEnabled && (
              <AccountButton
                isSignedIn={Boolean(isSignedIn)}
                displayName={accountDisplayName}
                onClick={onOpenAccount || (() => {})}
              />
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsHowToPlayOpen(true)}
              className="min-h-[44px] min-w-[44px] rounded-xl text-xs font-bold text-[#A89BC8] hover:text-[#F5F3FF] hover:bg-white/5 active:bg-white/10 flex items-center justify-center p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7]"
              style={{ touchAction: 'manipulation' }}
              aria-label="How to play"
            >
              ❓ Rules
            </button>

            <button
              type="button"
              onClick={() => setIsConfirmLeaveOpen(true)}
              className="text-xs font-bold text-[#F43F5E] hover:text-rose-300 active:text-rose-400 px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 min-h-[44px] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]"
              style={{ touchAction: 'manipulation' }}
            >
              Leave Lobby
            </button>
          </div>
        </header>

        {/* Room Code Card */}
        <Card variant="surface" padding="md" className="text-center mb-4 shadow-2xl">
          <span className="text-xs uppercase font-extrabold tracking-widest text-[#A89BC8] block mb-1">
            Room Code
          </span>
          <div className="font-mono font-black text-4xl sm:text-5xl tracking-[0.25em] text-[#C084FC] my-2 select-all drop-shadow-[0_0_15px_rgba(168,85,247,0.35)]">
            {roomView.roomCode}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={handleShare}
              className="min-h-[44px]"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              <span>Share Room Code</span>
            </Button>

            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={handleCopyCode}
              className="min-h-[44px]"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>Copy code</span>
            </Button>
          </div>
        </Card>

        {/* Host Settings Card */}
        <Card variant="surface" padding="md" className="mb-4 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#F5F3FF]">
              Cards Per Player
            </h2>
            <span className="text-[11px] font-bold text-[#A89BC8]">
              max {maxAllowed}
            </span>
          </div>

          {isHost ? (
            <div className="space-y-3">
              {/* Preset Chips */}
              <div className="grid grid-cols-3 gap-2">
                {presets.map((preset) => {
                  const isDisabled = preset > maxAllowed;
                  const isSelected = preset === currentCards;
                  const isRec = preset === recommended;

                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onUpdateSettings(preset)}
                      style={{ touchAction: 'manipulation' }}
                      className={`relative min-h-[44px] rounded-xl flex flex-col items-center justify-center p-1.5 font-bold transition-all border ${
                        isDisabled
                          ? 'bg-[#120824]/50 border-white/5 text-[#A89BC8]/30 cursor-not-allowed opacity-40'
                          : isSelected
                          ? 'bg-[#7C3AED]/30 border-[#A855F7] text-[#F5F3FF] shadow-primary-glow ring-1 ring-[#A855F7]'
                          : 'bg-[#221440] border-[rgba(167,139,250,0.18)] text-[#A89BC8] hover:text-[#F5F3FF] hover:border-purple-400/40 active:scale-95'
                      }`}
                    >
                      <span className="text-sm font-black">{preset}</span>
                      {isRec && (
                        <span className="text-[9px] font-extrabold text-[#22C55E] leading-tight">
                          recommended
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Stepper Control */}
              <div className="flex items-center justify-between bg-[#221440] rounded-xl p-2 border border-[rgba(167,139,250,0.18)]">
                <button
                  type="button"
                  disabled={currentCards <= 3}
                  onClick={() => onUpdateSettings(currentCards - 1)}
                  style={{ touchAction: 'manipulation' }}
                  className="w-11 h-11 rounded-lg bg-[#1A1030] hover:bg-[#2e1955] active:bg-[#120824] text-[#F5F3FF] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xl font-bold border border-[rgba(167,139,250,0.18)] transition-all min-h-[44px] min-w-[44px]"
                  aria-label="Decrease cards"
                >
                  −
                </button>

                <div className="flex flex-col items-center select-none">
                  <span className="font-mono text-2xl font-black text-[#F5F3FF]">
                    {currentCards}
                  </span>
                  <span className="text-[10px] text-[#A89BC8] font-bold">
                    {currentCards === 1 ? 'card each' : 'cards each'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={currentCards >= maxAllowed}
                  onClick={() => onUpdateSettings(currentCards + 1)}
                  style={{ touchAction: 'manipulation' }}
                  className="w-11 h-11 rounded-lg bg-[#1A1030] hover:bg-[#2e1955] active:bg-[#120824] text-[#F5F3FF] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xl font-bold border border-[rgba(167,139,250,0.18)] transition-all min-h-[44px] min-w-[44px]"
                  aria-label="Increase cards"
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            /* Read-only view for non-hosts */
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#221440] border border-[rgba(167,139,250,0.18)]">
              <span className="text-xs font-bold text-[#A89BC8] uppercase tracking-wider">
                Dealing
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-black text-[#C084FC]">
                  {pluralize(currentCards, 'card')} each
                </span>
                {currentCards === recommended && (
                  <Pill variant="success" className="text-[10px]">
                    recommended
                  </Pill>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Players List as Seats */}
        <Card variant="surface" padding="md" className="mb-4 shadow-xl">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#F5F3FF]">
              Seats
            </h2>
            <Pill variant="secondary" className="font-mono font-bold">
              {roomView.players.length}/8 players
            </Pill>
          </div>

          <div className="space-y-2">
            {/* Active Players */}
            {roomView.players.map((player) => {
              const isCurrentPlayer = player.playerId === currentPlayerId;
              const isPlayerHost = player.playerId === roomView.hostId;

              return (
                <div
                  key={player.playerId}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isCurrentPlayer
                      ? 'bg-[#221440] border-[#A855F7]/50 shadow-sm'
                      : 'bg-[#1A1030] border-[rgba(167,139,250,0.15)]'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <Avatar name={player.name} size="md" />

                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Green or Grey Connection Dot */}
                      <span
                        title={player.connected ? 'Connected' : 'Offline'}
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          player.connected ? 'bg-[#22C55E]' : 'bg-[#A89BC8]'
                        }`}
                      />

                      <span
                        className={`font-bold text-sm truncate ${
                          player.connected ? 'text-[#F5F3FF]' : 'text-[#A89BC8] line-through'
                        }`}
                      >
                        {player.name}
                      </span>

                      {isCurrentPlayer && (
                        <Pill variant="primary" className="text-[10px] py-0 px-1.5">
                          You
                        </Pill>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isPlayerHost && (
                      <Pill variant="gold" className="text-[11px] font-bold">
                        <span>👑</span>
                        <span>Host</span>
                      </Pill>
                    )}

                    {!player.connected && (
                      <Pill variant="danger" className="text-[10px]">
                        Offline
                      </Pill>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty Seat Placeholders with Dashed Borders */}
            {Array.from({ length: emptySeatsCount }).map((_, index) => (
              <div
                key={`empty-seat-${index}`}
                className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-[rgba(167,139,250,0.12)] bg-[#1A1030]/30 select-none"
                style={{ minHeight: '44px' }}
              >
                <div className="w-9 h-9 rounded-full border-2 border-dashed border-[rgba(167,139,250,0.2)] flex items-center justify-center text-[#A89BC8]/40 shrink-0">
                  <span className="text-xs font-bold">＋</span>
                </div>
                <span className="text-xs font-semibold text-[#A89BC8]/50">
                  Waiting...
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Footer / Start Game Action */}
      <footer className="mt-4 pt-2">
        {isHost ? (
          <div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={playerCount < 2}
              onClick={onStartGame}
            >
              <span>Deal &amp; Start Game</span>
            </Button>
            {playerCount < 2 && (
              <p className="text-center text-xs font-semibold text-[#A89BC8] mt-2">
                Need at least 2 players
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm font-semibold text-[#A89BC8]">
              Waiting for the host to start
            </p>
          </div>
        )}
      </footer>

      {/* Leave Lobby Confirmation Sheet */}
      <Sheet
        isOpen={isConfirmLeaveOpen}
        onClose={() => setIsConfirmLeaveOpen(false)}
        title="Leave Lobby?"
        subtitle="You will be returned to the main screen"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#A89BC8]">
            Are you sure you want to leave this game room?
          </p>
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="danger"
              size="md"
              fullWidth
              onClick={() => {
                setIsConfirmLeaveOpen(false);
                onLeaveRoom();
              }}
            >
              Yes, leave
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => setIsConfirmLeaveOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>

      {/* How to Play Modal */}
      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
      />
    </div>
  );
};
