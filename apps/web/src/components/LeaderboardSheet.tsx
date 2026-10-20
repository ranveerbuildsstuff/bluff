import React, { useState, useEffect } from 'react';
import { LeaderboardEntry } from '@bluff/shared';
import { getLeaderboard, getMe } from '../api';
import { getFreshIdToken } from '../firebase';

interface LeaderboardSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isSignedIn: boolean;
}

export const LeaderboardSheet: React.FC<LeaderboardSheetProps> = ({
  isOpen,
  onClose,
  isSignedIn,
}) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<{
    displayName: string;
    wins: number;
    gamesPlayed: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const [leaderboard, token] = await Promise.all([
          getLeaderboard(20),
          isSignedIn ? getFreshIdToken() : Promise.resolve(null),
        ]);

        let meData = null;
        if (token) {
          try {
            const me = await getMe(token);
            meData = {
              displayName: me.displayName,
              wins: me.wins,
              gamesPlayed: me.gamesPlayed,
            };
          } catch {
            // Ignore failure to fetch own stats for highlighting
          }
        }

        if (!isCancelled) {
          setEntries(leaderboard);
          setMyStats(meData);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Failed to load leaderboard');
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, isSignedIn]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4">
      <div className="w-full sm:max-w-[420px] bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🏆</span>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">
                Leaderboard
              </h2>
              <p className="text-xs text-slate-400">Top ranked players</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full text-slate-400 hover:text-white flex items-center justify-center text-lg min-h-[44px] min-w-[44px]"
            style={{ touchAction: 'manipulation' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {error && (
            <div className="p-3 mb-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
              <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span>Loading leaderboard...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center px-4">
              <span className="text-4xl block mb-3">🎲</span>
              <p className="text-sm font-semibold text-slate-300">
                No ranked games yet. Be the first!
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Games with 3+ players count towards the leaderboard.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Header row */}
              <div className="grid grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1.5">
                <span className="col-span-2">Rank</span>
                <span className="col-span-5">Player</span>
                <span className="col-span-2 text-center text-amber-400">Wins</span>
                <span className="col-span-3 text-right">Win Rate</span>
              </div>

              {/* Rows */}
              {entries.map((entry) => {
                const isOwnRow =
                  Boolean(myStats) &&
                  entry.displayName === myStats?.displayName &&
                  entry.wins === myStats?.wins &&
                  entry.gamesPlayed === myStats?.gamesPlayed;

                return (
                  <div
                    key={`${entry.rank}-${entry.displayName}-${entry.gamesPlayed}`}
                    className={`grid grid-cols-12 items-center px-3 py-2.5 rounded-xl text-xs transition-colors ${
                      isOwnRow
                        ? 'bg-indigo-600/25 border border-indigo-400/50 shadow-sm'
                        : 'bg-slate-800/60 border border-slate-700/40 hover:bg-slate-800'
                    }`}
                  >
                    {/* Rank */}
                    <div className="col-span-2 flex items-center font-bold">
                      {entry.rank === 1 ? (
                        <span className="text-amber-400 font-black">🥇 1</span>
                      ) : entry.rank === 2 ? (
                        <span className="text-slate-300 font-black">🥈 2</span>
                      ) : entry.rank === 3 ? (
                        <span className="text-amber-600 font-black">🥉 3</span>
                      ) : (
                        <span className="text-slate-400 font-mono">#{entry.rank}</span>
                      )}
                    </div>

                    {/* Name */}
                    <div className="col-span-5 flex items-center gap-1.5 min-w-0 pr-1">
                      <span className="font-semibold text-white truncate">
                        {entry.displayName}
                      </span>
                      {isOwnRow && (
                        <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 shrink-0">
                          You
                        </span>
                      )}
                    </div>

                    {/* Wins */}
                    <div className="col-span-2 text-center font-mono font-bold text-amber-300">
                      {entry.wins}
                    </div>

                    {/* Win rate & Games */}
                    <div className="col-span-3 text-right">
                      <div className="font-mono font-bold text-emerald-400">
                        {Math.round(entry.winRate * 100)}%
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {entry.gamesPlayed} {entry.gamesPlayed === 1 ? 'game' : 'games'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-200 font-semibold text-xs border border-slate-700 min-h-[44px] flex items-center justify-center transition-colors"
            style={{ touchAction: 'manipulation' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
