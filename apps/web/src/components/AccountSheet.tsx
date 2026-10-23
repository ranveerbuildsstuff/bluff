import React, { useState, useEffect } from 'react';
import { PlayerNameSchema, pluralize } from '@bluff/shared';
import { getMe, updateMyName, deleteMyStats } from '../api';
import { getFreshIdToken } from '../firebase';

interface AccountSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  onNameUpdated?: (newName: string) => void;
  onStatsDeleted?: () => void;
}

interface UserProfile {
  displayName: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
}

export const AccountSheet: React.FC<AccountSheetProps> = ({
  isOpen,
  onClose,
  onSignOut,
  onNameUpdated,
  onStatsDeleted,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadTrigger, setLoadTrigger] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
      setIsEditingName(false);
      setError(null);
      setSuccess(null);
      return;
    }

    let isCancelled = false;
    async function loadProfile() {
      setIsLoading(true);
      setError(null);
      try {
        const token = await getFreshIdToken();
        if (!token) throw new Error('Not authenticated');
        const data = await getMe(token);
        if (!isCancelled) {
          setProfile(data);
          setNameInput(data.displayName);
        }
      } catch {
        if (!isCancelled) {
          setError('Could not load account details. Please check your connection and try again.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, loadTrigger]);

  if (!isOpen) return null;

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const check = PlayerNameSchema.safeParse(nameInput);
    if (!check.success) {
      setError(check.error.issues[0]?.message || 'Name must be 1-16 characters');
      return;
    }

    setIsSavingName(true);
    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('Not authenticated');
      const updated = await updateMyName(token, check.data);
      setProfile(updated);
      setNameInput(updated.displayName);
      setIsEditingName(false);
      setSuccess('Display name updated');
      onNameUpdated?.(updated.displayName);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update name');
      }
    } finally {
      setIsSavingName(false);
    }
  };

  const handleDeleteStats = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('Not authenticated');
      await deleteMyStats(token);
      setProfile({
        displayName: profile?.displayName || 'Player',
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
      });
      setConfirmDelete(false);
      setSuccess('Stats deleted successfully');
      onStatsDeleted?.();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to delete stats');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const initialLetter = (profile?.displayName || 'P').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4">
      <div className="w-full sm:max-w-[380px] bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-lg shadow-md">
              {initialLetter}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">My Account</h2>
              <p className="text-xs text-slate-400">Signed in player</p>
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

        {/* Feedback Messages */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium leading-relaxed">
            <p className="mb-2">{error}</p>
            {!profile && (
              <button
                type="button"
                onClick={() => setLoadTrigger((n) => n + 1)}
                className="px-4 py-2 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 font-semibold text-xs min-h-[44px] transition-colors"
                style={{ touchAction: 'manipulation' }}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium leading-relaxed">
            {success}
          </div>
        )}

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span>Loading profile...</span>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Display Name Section */}
            <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Display Name
                </span>
                {!isEditingName && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingName(true);
                      setNameInput(profile?.displayName || '');
                    }}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 min-h-[44px] flex items-center"
                    style={{ touchAction: 'manipulation' }}
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditingName ? (
                <form onSubmit={handleSaveName} className="space-y-2 mt-1">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={16}
                    placeholder="Enter new name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isSavingName}
                      className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50"
                      style={{ touchAction: 'manipulation' }}
                    >
                      {isSavingName ? 'Saving...' : 'Save Name'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingName(false);
                        setNameInput(profile?.displayName || '');
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-slate-300 text-xs font-semibold min-h-[44px] transition-colors"
                      style={{ touchAction: 'manipulation' }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="text-base font-bold text-white tracking-wide">
                  {profile?.displayName || 'Player'}
                </div>
              )}
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-3 text-center">
                <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                  Games
                </span>
                <span className="font-mono text-xl font-black text-white">
                  {profile?.gamesPlayed ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {pluralize(profile?.gamesPlayed ?? 0, 'played', 'played')}
                </span>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-3 text-center">
                <span className="text-[11px] font-semibold text-amber-400 block uppercase tracking-wider mb-1">
                  Wins
                </span>
                <span className="font-mono text-xl font-black text-amber-300">
                  {profile?.wins ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {pluralize(profile?.wins ?? 0, 'win')}
                </span>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-3 text-center">
                <span className="text-[11px] font-semibold text-emerald-400 block uppercase tracking-wider mb-1">
                  Win %
                </span>
                <span className="font-mono text-xl font-black text-emerald-300">
                  {Math.round((profile?.winRate ?? 0) * 100)}%
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  rate
                </span>
              </div>
            </div>

            {/* Actions: Sign out & Delete Stats */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="w-full min-h-[48px] rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-200 font-semibold text-sm border border-slate-700 transition-colors flex items-center justify-center gap-2"
                style={{ touchAction: 'manipulation' }}
              >
                <span>Sign out</span>
              </button>

              {confirmDelete ? (
                <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 space-y-2.5">
                  <p className="text-xs font-semibold text-rose-300 leading-snug">
                    Are you sure? This permanently deletes your stats and leaderboard ranking.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDeleteStats}
                      className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold min-h-[44px] transition-colors disabled:opacity-50"
                      style={{ touchAction: 'manipulation' }}
                    >
                      {isDeleting ? 'Deleting...' : 'Yes, delete my stats'}
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setConfirmDelete(false)}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold min-h-[44px] transition-colors"
                      style={{ touchAction: 'manipulation' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-xs text-rose-400 hover:text-rose-300 active:text-rose-500 font-medium py-2 min-h-[44px] flex items-center justify-center transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  Delete my stats
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
