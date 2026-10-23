import React, { useState, useEffect } from 'react';
import { LeaderboardEntry } from '@bluff/shared';
import { getLeaderboard, getMe } from '../api';
import { getFreshIdToken } from '../firebase';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { Pill } from '../ui/Pill';

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
  const [loadTrigger, setLoadTrigger] = useState(0);

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
      } catch {
        if (!isCancelled) {
          setError('Could not load leaderboard. Please check your connection and try again.');
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
  }, [isOpen, isSignedIn, loadTrigger]);

  if (!isOpen) return null;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <span className="text-lg font-black text-[#F5F3FF]">Leaderboard</span>
        </div>
      }
      subtitle="Top ranked players"
    >
      <div className="flex flex-col min-h-[300px]">
        {error && (
          <div className="p-3 mb-4 rounded-xl bg-[#F43F5E]/15 border border-[#F43F5E]/30 text-rose-300 text-xs font-medium">
            <p className="mb-2">{error}</p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setLoadTrigger((n) => n + 1)}
            >
              Retry
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-[#A89BC8] text-sm">
            <div className="w-7 h-7 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin" />
            <span>Loading leaderboard...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center px-4">
            <span className="text-4xl block mb-3">🎲</span>
            <p className="text-sm font-bold text-[#F5F3FF]">
              No ranked games yet. Be the first!
            </p>
            <p className="text-xs text-[#A89BC8] mt-1">
              Games with 3+ players count towards the leaderboard.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 flex-1">
            {/* Header row */}
            <div className="grid grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-[#A89BC8] px-3 py-1.5 border-b border-[rgba(167,139,250,0.1)]">
              <span className="col-span-2">Rank</span>
              <span className="col-span-5">Player</span>
              <span className="col-span-2 text-center text-[#F5B942]">Wins</span>
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
                      ? 'bg-violet-600/25 border border-purple-400/50 shadow-sm'
                      : 'bg-[#221440]/60 border border-[rgba(167,139,250,0.12)] hover:bg-[#221440]'
                  }`}
                >
                  {/* Rank */}
                  <div className="col-span-2 flex items-center font-bold">
                    {entry.rank === 1 ? (
                      <span className="text-[#F5B942] font-black">🥇 1</span>
                    ) : entry.rank === 2 ? (
                      <span className="text-slate-300 font-black">🥈 2</span>
                    ) : entry.rank === 3 ? (
                      <span className="text-amber-500 font-black">🥉 3</span>
                    ) : (
                      <span className="text-[#A89BC8] font-mono font-bold">#{entry.rank}</span>
                    )}
                  </div>

                  {/* Name + Avatar */}
                  <div className="col-span-5 flex items-center gap-2 min-w-0 pr-1">
                    <Avatar name={entry.displayName} size="sm" />
                    <span className="font-bold text-[#F5F3FF] truncate">
                      {entry.displayName}
                    </span>
                    {isOwnRow && (
                      <Pill variant="primary" className="text-[9px] px-1.5 py-0 shrink-0">
                        You
                      </Pill>
                    )}
                  </div>

                  {/* Wins */}
                  <div className="col-span-2 text-center font-mono font-black text-[#F5B942]">
                    {entry.wins}
                  </div>

                  {/* Win rate & Games */}
                  <div className="col-span-3 text-right">
                    <div className="font-mono font-bold text-[#22C55E]">
                      {Math.round(entry.winRate * 100)}%
                    </div>
                    <div className="text-[10px] text-[#A89BC8]">
                      {entry.gamesPlayed} {entry.gamesPlayed === 1 ? 'game' : 'games'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 mt-4 border-t border-[rgba(167,139,250,0.12)]">
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
