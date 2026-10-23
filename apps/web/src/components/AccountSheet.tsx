import React, { useState, useEffect } from 'react';
import { PlayerNameSchema, pluralize } from '@bluff/shared';
import { getMe, updateMyName, deleteMyStats } from '../api';
import { getFreshIdToken } from '../firebase';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';

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

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <Avatar name={profile?.displayName || 'Player'} size="md" />
          <div>
            <div className="text-base font-bold text-[#F5F3FF]">My Account</div>
            <div className="text-xs text-[#A89BC8] font-normal">Signed in player</div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Feedback Messages */}
        {error && (
          <div className="p-3 rounded-xl bg-[#F43F5E]/15 border border-[#F43F5E]/30 text-rose-300 text-xs font-medium leading-relaxed">
            <p className="mb-2">{error}</p>
            {!profile && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setLoadTrigger((n) => n + 1)}
              >
                Retry
              </Button>
            )}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30 text-emerald-300 text-xs font-medium leading-relaxed">
            {success}
          </div>
        )}

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#A89BC8] text-sm">
            <div className="w-6 h-6 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin" />
            <span>Loading profile...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Display Name Section */}
            <Card variant="surface-2" padding="sm" className="rounded-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-[#A89BC8] uppercase tracking-wider">
                  Display Name
                </span>
                {!isEditingName && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingName(true);
                      setNameInput(profile?.displayName || '');
                    }}
                    className="text-xs font-bold text-[#A855F7] hover:text-purple-300 min-h-[44px] px-2 flex items-center"
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
                    className="w-full px-3 py-2 rounded-xl bg-[#1A1030] border border-[rgba(167,139,250,0.2)] text-[#F5F3FF] text-sm focus:outline-none focus:ring-2 focus:ring-[#A855F7] min-h-[44px]"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={isSavingName}
                      className="flex-1"
                    >
                      Save Name
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setIsEditingName(false);
                        setNameInput(profile?.displayName || '');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="text-base font-bold text-[#F5F3FF] tracking-wide">
                  {profile?.displayName || 'Player'}
                </div>
              )}
            </Card>

            {/* Stats Overview */}
            <div className="grid grid-cols-3 gap-2">
              <Card variant="surface-2" padding="sm" className="text-center rounded-2xl">
                <span className="text-[11px] font-bold text-[#A89BC8] block uppercase tracking-wider mb-1">
                  Games
                </span>
                <span className="font-mono text-xl font-black text-[#F5F3FF]">
                  {profile?.gamesPlayed ?? 0}
                </span>
                <span className="text-[10px] text-[#A89BC8] block mt-0.5">
                  {pluralize(profile?.gamesPlayed ?? 0, 'played', 'played')}
                </span>
              </Card>

              <Card variant="surface-2" padding="sm" className="text-center rounded-2xl">
                <span className="text-[11px] font-bold text-[#F5B942] block uppercase tracking-wider mb-1">
                  Wins
                </span>
                <span className="font-mono text-xl font-black text-[#F5B942]">
                  {profile?.wins ?? 0}
                </span>
                <span className="text-[10px] text-[#A89BC8] block mt-0.5">
                  {pluralize(profile?.wins ?? 0, 'win')}
                </span>
              </Card>

              <Card variant="surface-2" padding="sm" className="text-center rounded-2xl">
                <span className="text-[11px] font-bold text-[#22C55E] block uppercase tracking-wider mb-1">
                  Win %
                </span>
                <span className="font-mono text-xl font-black text-[#22C55E]">
                  {Math.round((profile?.winRate ?? 0) * 100)}%
                </span>
                <span className="text-[10px] text-[#A89BC8] block mt-0.5">
                  rate
                </span>
              </Card>
            </div>

            {/* Actions: Sign out & Delete Stats */}
            <div className="pt-2 space-y-3">
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
              >
                Sign out
              </Button>

              {confirmDelete ? (
                <div className="p-3.5 rounded-2xl bg-[#F43F5E]/10 border border-[#F43F5E]/30 space-y-2.5">
                  <p className="text-xs font-semibold text-rose-300 leading-snug">
                    Are you sure? This permanently deletes your stats and leaderboard ranking.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={isDeleting}
                      onClick={handleDeleteStats}
                      className="flex-1 font-bold"
                    >
                      Yes, delete my stats
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-[#F43F5E] hover:text-rose-300"
                >
                  Delete my stats
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
};
