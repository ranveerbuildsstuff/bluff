import React, { useState, useEffect, useRef } from 'react';
import { PlayerNameSchema, RoomCodeSchema, resolveRoomPrefill } from '@bluff/shared';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { PlayingCard } from '../ui/PlayingCard';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { AccountButton } from './AccountButton';
import { HowToPlayModal } from './HowToPlayModal';

interface LandingScreenProps {
  initialName: string;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onErrorToast: (message: string) => void;
  isAccountsEnabled?: boolean;
  isSignedIn?: boolean;
  accountDisplayName?: string | null;
  onOpenAccount?: () => void;
  onOpenLeaderboard?: () => void;
}

const VISITED_KEY = 'bluff_has_visited';

export const LandingScreen: React.FC<LandingScreenProps> = ({
  initialName,
  onCreateRoom,
  onJoinRoom,
  onErrorToast,
  isAccountsEnabled = false,
  isSignedIn = false,
  accountDisplayName = null,
  onOpenAccount,
  onOpenLeaderboard,
}) => {
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Name state: prefill from accountDisplayName if available, otherwise initialName
  const [playerName, setPlayerName] = useState(() => {
    return accountDisplayName?.trim() || initialName || '';
  });

  // URL prefill handling
  const initialPrefill = typeof window !== 'undefined'
    ? resolveRoomPrefill(window.location.search, window.location.pathname, window.location.hash)
    : { prefilledCode: null, cleanedUrl: null };

  const [roomCode, setRoomCode] = useState(initialPrefill.prefilledCode ?? '');
  const [prefilledRoom, setPrefilledRoom] = useState<string | null>(initialPrefill.prefilledCode);

  // Sheets state
  const [isJoinOpen, setIsJoinOpen] = useState(Boolean(initialPrefill.prefilledCode));
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);

  // First-visit nudge state (never auto-opens, never blocks)
  const [showNudge, setShowNudge] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !localStorage.getItem(VISITED_KEY);
    } catch {
      return false;
    }
  });

  // Sync account display name when signing in/out
  useEffect(() => {
    if (accountDisplayName) {
      setPlayerName(accountDisplayName);
    }
  }, [accountDisplayName]);

  // Handle client-side URL prefill cleanup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const result = resolveRoomPrefill(
        window.location.search,
        window.location.pathname,
        window.location.hash
      );
      if (result.prefilledCode && result.cleanedUrl) {
        setRoomCode(result.prefilledCode);
        setPrefilledRoom(result.prefilledCode);
        setIsJoinOpen(true);
        window.history.replaceState({}, '', result.cleanedUrl);
      }
    } catch {
      // Silently ignore URL parsing error
    }
  }, []);

  const handleNameChange = (val: string) => {
    setPlayerName(val);
    try {
      localStorage.setItem('bluff_saved_name', val);
    } catch {
      // Ignore storage errors
    }
  };

  const handleDismissNudge = () => {
    setShowNudge(false);
    try {
      localStorage.setItem(VISITED_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  };

  const handleOpenLearnNudge = () => {
    handleDismissNudge();
    setIsHowToPlayOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const result = PlayerNameSchema.safeParse(playerName);
    if (!result.success) {
      onErrorToast(result.error.issues[0]?.message || 'Please enter a valid player name (1-16 chars)');
      nameInputRef.current?.focus();
      return;
    }
    onCreateRoom(result.data);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nameResult = PlayerNameSchema.safeParse(playerName);
    if (!nameResult.success) {
      onErrorToast(nameResult.error.issues[0]?.message || 'Please enter a valid player name (1-16 chars)');
      setIsJoinOpen(false);
      nameInputRef.current?.focus();
      return;
    }

    const codeUpper = roomCode.trim().toUpperCase();
    const codeResult = RoomCodeSchema.safeParse(codeUpper);
    if (!codeResult.success) {
      onErrorToast(codeResult.error.issues[0]?.message || 'Room code must be 6 valid characters');
      return;
    }

    onJoinRoom(codeResult.data, nameResult.data);
  };

  const handlePasteCode = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text') || '';
    const cleaned = pasted.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRoomCode(cleaned);
  };

  return (
    <div className="w-full max-w-app mx-auto px-4 py-4 sm:py-6 flex flex-col justify-between min-h-[100dvh]">
      {/* Top Bar: Optional Leaderboard & Account Profile */}
      <header className="flex items-center justify-between mb-2 sm:mb-4 h-12">
        {isAccountsEnabled ? (
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#221440] hover:bg-[#2c1954] active:bg-[#1a0e33] border border-[rgba(167,139,250,0.18)] text-xs font-bold text-[#F5B942] flex items-center gap-1.5 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7]"
            style={{ touchAction: 'manipulation' }}
          >
            <span>🏆</span>
            <span>Leaderboard</span>
          </button>
        ) : (
          <div />
        )}

        {isAccountsEnabled && (
          <AccountButton
            isSignedIn={Boolean(isSignedIn)}
            displayName={accountDisplayName}
            onClick={onOpenAccount || (() => {})}
          />
        )}
      </header>

      {/* First-Visit Nudge */}
      {showNudge && (
        <aside
          role="region"
          aria-label="Welcome notice"
          className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-purple-950/70 to-indigo-950/70 border border-purple-500/30 flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <button
            type="button"
            onClick={handleOpenLearnNudge}
            className="flex items-center gap-2.5 text-left min-w-0 pr-2 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7] rounded-lg"
          >
            <span className="text-xl">✨</span>
            <div>
              <div className="text-xs font-bold text-[#F5F3FF]">
                New here? Learn in 30 seconds
              </div>
              <div className="text-[11px] text-[#A89BC8]">
                Tap to see how bluffing works →
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleDismissNudge}
            className="w-11 h-11 text-[#A89BC8] hover:text-[#F5F3FF] flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7]"
            aria-label="Dismiss new player tip"
          >
            ✕
          </button>
        </aside>
      )}

      {/* Main Hero & Action Section */}
      <main className="flex-1 flex flex-col justify-center my-auto py-2">
        {/* Hero: Logo + Floating 4-Card Fan */}
        <div className="text-center mb-6">
          <h1 className="logo-bluff text-5xl sm:text-6xl tracking-tight mb-2">
            BLUFF
          </h1>
          <p className="text-sm font-medium text-[#A89BC8]">
            The card game where lying is the only way to win
          </p>

          {/* Fan of 4 Cards */}
          <div
            className="relative h-28 w-48 mx-auto mt-5 mb-2 flex items-center justify-center select-none animate-idle-float"
            aria-hidden="true"
          >
            <PlayingCard
              rank="A"
              suit="S"
              size="md"
              className="absolute transform -rotate-18 -translate-x-12 -translate-y-1 shadow-2xl"
            />
            <PlayingCard
              rank="K"
              suit="H"
              size="md"
              className="absolute transform -rotate-6 -translate-x-4 -translate-y-3 shadow-2xl"
            />
            <PlayingCard
              rank="Q"
              suit="D"
              size="md"
              className="absolute transform rotate-6 translate-x-4 -translate-y-3 shadow-2xl"
            />
            <PlayingCard
              rank="J"
              suit="C"
              size="md"
              className="absolute transform rotate-18 translate-x-12 -translate-y-1 shadow-2xl"
            />
          </div>
        </div>

        {/* Action Card Container */}
        <Card variant="surface" padding="md" className="space-y-4 shadow-2xl">
          {/* Name Field */}
          <div>
            <label
              htmlFor="player-name"
              className="block text-xs font-bold text-[#A89BC8] uppercase tracking-wider mb-1.5"
            >
              Your Name
            </label>
            <input
              id="player-name"
              ref={nameInputRef}
              type="text"
              value={playerName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter your nickname"
              maxLength={16}
              autoComplete="nickname"
              className="w-full px-4 rounded-xl bg-[#221440] border border-[rgba(167,139,250,0.22)] text-[#F5F3FF] placeholder-[#A89BC8]/50 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#A855F7] min-h-[48px]"
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleCreate}
            >
              <span>Create room</span>
              <span className="text-xl">＋</span>
            </Button>

            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => setIsJoinOpen(true)}
            >
              <span>Join with code</span>
              <span className="text-lg">→</span>
            </Button>

            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => setIsHowToPlayOpen(true)}
              className="text-[#A89BC8]"
            >
              <span>How to play</span>
            </Button>
          </div>
        </Card>
      </main>

      {/* Footer Chips (Only true ones) */}
      <footer className="pt-4 pb-2 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Pill variant="muted">Guests welcome</Pill>
          <Pill variant="muted">No download</Pill>
          <Pill variant="muted">Play with friends anywhere</Pill>
        </div>
      </footer>

      {/* Join with Code Sheet */}
      <Sheet
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
        title="Join with code"
        subtitle="Enter the 6-character room code from your friend"
      >
        <form onSubmit={handleJoinSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="room-code"
              className="block text-xs font-bold text-[#A89BC8] uppercase tracking-wider mb-2 text-center"
            >
              Room Code
            </label>
            <input
              id="room-code"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
              onPaste={handlePasteCode}
              placeholder="••••••"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className="w-full px-4 py-3 rounded-2xl bg-[#221440] border-2 border-[rgba(167,139,250,0.3)] text-[#F5F3FF] placeholder-[#A89BC8]/40 text-center font-mono font-black text-2xl tracking-[0.3em] uppercase focus:outline-none focus:ring-2 focus:ring-[#A855F7] min-h-[56px]"
            />
            {prefilledRoom && roomCode === prefilledRoom && (
              <p className="text-xs text-purple-300 mt-2 text-center font-medium">
                You&apos;re joining room {prefilledRoom}
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={roomCode.trim().length !== 6}
          >
            Join Room
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            fullWidth
            onClick={() => setIsJoinOpen(false)}
            className="text-xs text-[#A89BC8]"
          >
            Cancel
          </Button>
        </form>
      </Sheet>

      {/* How to Play Sheet */}
      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
      />
    </div>
  );
};
