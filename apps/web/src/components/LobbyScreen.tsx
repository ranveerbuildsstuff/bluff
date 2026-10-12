import React from 'react';
import { RoomView } from '@bluff/shared';

interface LobbyScreenProps {
  roomView: RoomView;
  currentPlayerId: string;
  isSocketConnected: boolean;
  onLeaveRoom: () => void;
  onInfoToast: (message: string) => void;
  onErrorToast: (message: string) => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  roomView,
  currentPlayerId,
  isSocketConnected,
  onLeaveRoom,
  onInfoToast,
  onErrorToast,
}) => {
  const isHost = roomView.hostId === currentPlayerId;

  const handleShare = async () => {
    const textToShare = `Join my Bluff game! Code: ${roomView.roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Bluff Card Game',
          text: textToShare,
          url: window.location.href,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to clipboard
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(roomView.roomCode);
        onInfoToast(`Room code ${roomView.roomCode} copied to clipboard!`);
        return;
      } catch {
        onErrorToast('Failed to copy to clipboard');
      }
    } else {
      onInfoToast(`Room Code: ${roomView.roomCode}`);
    }
  };

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
          >
            Leave Lobby
          </button>
        </div>

        {/* Room Code Showcase */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 shadow-xl text-center mb-6">
          <span className="text-xs uppercase font-bold tracking-widest text-slate-400 block mb-1">
            Room Code
          </span>
          <div className="font-mono font-black text-4xl tracking-widest text-indigo-400 my-2 select-all">
            {roomView.roomCode}
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="mt-3 w-full px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 min-h-[44px] flex items-center justify-center gap-2 transition-colors"
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
        </div>

        {/* Player List */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 shadow-lg">
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
                    {/* Status Dot */}
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

      {/* Footer Info */}
      <div className="text-center mt-6">
        <p className="text-xs text-slate-400">
          {isHost
            ? 'Waiting for players to join before starting...'
            : 'Waiting for the host to start the game...'}
        </p>
      </div>
    </div>
  );
};
