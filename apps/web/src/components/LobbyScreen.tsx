import React from 'react';
import {
  RoomView,
  maxCardsPerPlayer,
  recommendedCardsPerPlayer,
  pluralize,
  buildRoomLink,
} from '@bluff/shared';

interface LobbyScreenProps {
  roomView: RoomView;
  currentPlayerId: string;
  isSocketConnected: boolean;
  onLeaveRoom: () => void;
  onUpdateSettings: (cardsPerPlayer: number) => void;
  onStartGame: () => void;
  onInfoToast: (message: string) => void;
  onErrorToast: (message: string) => void;
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
}) => {
  const isHost = roomView.hostId === currentPlayerId;
  const playerCount = roomView.players.length;
  const maxAllowed = maxCardsPerPlayer(playerCount);
  const recommended = recommendedCardsPerPlayer(playerCount);
  const currentCards = roomView.settings.cardsPerPlayer;

  const shareUrl = buildRoomLink(window.location.origin, roomView.roomCode);
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

  return (
    <div className="w-full max-w-[360px] mx-auto px-4 py-6 flex flex-col justify-between min-h-[640px]">
      {/* Top Bar: Connection & Leave */}
      <div>
        <div className="flex items-center justify-between mb-4">
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
            Leave Lobby
          </button>
        </div>

        {/* Room Code Showcase */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 shadow-xl text-center mb-5">
          <span className="text-xs uppercase font-bold tracking-widest text-slate-400 block mb-1">
            Room Code
          </span>
          <div className="font-mono font-black text-4xl tracking-widest text-indigo-400 my-2 select-all">
            {roomView.roomCode}
          </div>

          <div className="flex flex-col gap-2 mt-3">
            <button
              type="button"
              onClick={handleShare}
              className="w-full px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 min-h-[44px] flex items-center justify-center gap-2 transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              <span>Share Room Code</span>
            </button>

            <button
              type="button"
              onClick={handleCopyCode}
              className="w-full px-3 py-2 rounded-xl bg-slate-700/70 hover:bg-slate-700 active:bg-slate-800 text-slate-300 font-medium text-xs border border-slate-600/60 min-h-[44px] flex items-center justify-center gap-1.5 transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>Copy code</span>
            </button>
          </div>
        </div>

        {/* Host Settings / Game Setup */}
        <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-lg mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Cards Per Player
            </h2>
            <span className="text-[11px] font-semibold text-slate-400">
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
                          ? 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                          : isSelected
                          ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md shadow-indigo-600/20 ring-1 ring-indigo-400'
                          : 'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500 active:bg-slate-800'
                      }`}
                    >
                      <span className="text-sm">{preset}</span>
                      {isRec && (
                        <span className="text-[9px] font-medium text-emerald-400 leading-tight">
                          recommended
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Stepper Control */}
              <div className="flex items-center justify-between bg-slate-900/60 rounded-xl p-2 border border-slate-700/60">
                <button
                  type="button"
                  disabled={currentCards <= 3}
                  onClick={() => onUpdateSettings(currentCards - 1)}
                  style={{ touchAction: 'manipulation' }}
                  className="w-11 h-11 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-lg font-bold border border-slate-700 transition-colors"
                  aria-label="Decrease cards"
                >
                  −
                </button>

                <div className="flex flex-col items-center">
                  <span className="font-mono text-xl font-extrabold text-white">
                    {currentCards}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {currentCards === 1 ? 'card each' : 'cards each'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={currentCards >= maxAllowed}
                  onClick={() => onUpdateSettings(currentCards + 1)}
                  style={{ touchAction: 'manipulation' }}
                  className="w-11 h-11 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-lg font-bold border border-slate-700 transition-colors"
                  aria-label="Increase cards"
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            /* Read-only for non-hosts */
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-700/60">
              <span className="text-sm font-semibold text-slate-300">
                Dealing
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-indigo-300">
                  {pluralize(currentCards, 'card')} each
                </span>
                {currentCards === recommended && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    recommended
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Player List */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 shadow-lg mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Players
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
              {roomView.players.length} / 8
            </span>
          </div>

          <ul className="space-y-2">
            {roomView.players.map((player) => {
              const isCurrentPlayer = player.playerId === currentPlayerId;
              const isPlayerHost = player.playerId === roomView.hostId;

              return (
                <li
                  key={player.playerId}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isCurrentPlayer
                      ? 'bg-slate-700/80 border-indigo-500/50 shadow-sm'
                      : 'bg-slate-800/90 border-slate-700/70'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      title={player.connected ? 'Connected' : 'Offline'}
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        player.connected ? 'bg-emerald-400' : 'bg-rose-500 ring-2 ring-rose-950'
                      }`}
                    />

                    <span
                      className={`font-semibold text-sm truncate ${
                        player.connected ? 'text-white' : 'text-slate-400 line-through'
                      }`}
                    >
                      {player.name}
                    </span>

                    {isCurrentPlayer && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                        You
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {isPlayerHost && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <span>👑</span>
                        <span>Host</span>
                      </span>
                    )}

                    {!player.connected && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        Offline
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Footer / Host Start Game Action */}
      <div className="mt-4">
        {isHost ? (
          <div>
            <button
              type="button"
              disabled={playerCount < 2}
              onClick={onStartGame}
              style={{ touchAction: 'manipulation' }}
              className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
            >
              <span>Deal & Start Game</span>
            </button>
            {playerCount < 2 && (
              <p className="text-center text-xs text-slate-400 mt-2">
                Need at least 2 players to start
              </p>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xs text-slate-400">
              Waiting for the host to start the game...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
