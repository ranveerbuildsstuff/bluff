import React, { useState, useEffect, useRef } from 'react';
import { PlayerNameSchema, RoomCodeSchema, resolveRoomPrefill } from '@bluff/shared';

interface LandingScreenProps {
  initialName: string;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onErrorToast: (message: string) => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  initialName,
  onCreateRoom,
  onJoinRoom,
  onErrorToast,
}) => {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [playerName, setPlayerName] = useState(initialName);

  const initialPrefill = typeof window !== 'undefined'
    ? resolveRoomPrefill(window.location.search, window.location.pathname, window.location.hash)
    : { prefilledCode: null, cleanedUrl: null };

  const [roomCode, setRoomCode] = useState(initialPrefill.prefilledCode ?? '');
  const [prefilledRoom, setPrefilledRoom] = useState<string | null>(initialPrefill.prefilledCode);

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
        nameInputRef.current?.focus();
        window.history.replaceState({}, '', result.cleanedUrl);
      }
    } catch {
      // Silently ignore any URL parsing error
    }
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const result = PlayerNameSchema.safeParse(playerName);
    if (!result.success) {
      onErrorToast(result.error.issues[0]?.message || 'Please enter a valid player name (1-16 chars)');
      return;
    }
    onCreateRoom(result.data);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const nameResult = PlayerNameSchema.safeParse(playerName);
    if (!nameResult.success) {
      onErrorToast(nameResult.error.issues[0]?.message || 'Please enter a valid player name (1-16 chars)');
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

  return (
    <div className="w-full max-w-[360px] mx-auto px-4 py-8 flex flex-col justify-center min-h-[640px]">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-3 shadow-lg shadow-indigo-500/10">
          <span className="text-3xl">🃏</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1">
          BLUFF
        </h1>
        <p className="text-sm text-slate-400">
          The ultimate game of deception & strategy
        </p>
      </div>

      {/* Main Form Container */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-6">
        {/* Name Input */}
        <div>
          <label htmlFor="player-name" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Your Name
          </label>
          <input
            id="player-name"
            ref={nameInputRef}
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter nickname"
            maxLength={16}
            autoComplete="nickname"
            className="w-full px-4 rounded-xl bg-slate-900/90 border border-slate-600/80 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
            style={{ minHeight: '48px' }}
          />
        </div>

        {/* Create Room Section */}
        <div>
          <button
            type="button"
            onClick={handleCreate}
            className="w-full px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-base shadow-lg shadow-indigo-600/25 transition-colors flex items-center justify-center gap-2"
            style={{ minHeight: '48px' }}
          >
            <span>Create New Room</span>
            <span className="text-lg">＋</span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-700 w-full" />
          <span className="bg-slate-800 px-3 text-xs uppercase font-medium text-slate-400 tracking-wider absolute">
            or join with code
          </span>
        </div>

        {/* Join Room Section */}
        <div className="space-y-3">
          <div>
            <label htmlFor="room-code" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Room Code
            </label>
            <input
              id="room-code"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="6-LETTER CODE"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full px-4 rounded-xl bg-slate-900/90 border border-slate-600/80 text-white placeholder-slate-500 text-center font-mono font-bold tracking-widest text-lg uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              style={{ minHeight: '48px' }}
            />
            {prefilledRoom && roomCode === prefilledRoom && (
              <p className="text-xs text-indigo-400 mt-2 text-center font-medium">
                You&apos;re joining room {prefilledRoom}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleJoin}
            className="w-full px-4 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-semibold text-base border border-slate-600/80 transition-colors flex items-center justify-center gap-2"
            style={{ minHeight: '48px' }}
          >
            <span>Join Room</span>
            <span className="text-lg">→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
