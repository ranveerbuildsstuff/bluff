import React from 'react';
import { Avatar } from '../ui/Avatar';

interface AccountButtonProps {
  isSignedIn: boolean;
  displayName?: string | null;
  onClick: () => void;
  className?: string;
}

export const AccountButton: React.FC<AccountButtonProps> = ({
  isSignedIn,
  displayName,
  onClick,
  className = '',
}) => {
  if (isSignedIn) {
    const name = displayName?.trim() || 'Player';
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Account Profile"
        className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-1 rounded-full transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7] ${className}`}
        style={{ touchAction: 'manipulation' }}
      >
        <Avatar name={name} size="md" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#221440] hover:bg-[#2c1954] active:bg-[#1a0e33] border border-[rgba(167,139,250,0.18)] text-xs font-bold text-[#F5F3FF] flex items-center justify-center shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7] ${className}`}
      style={{ touchAction: 'manipulation' }}
    >
      Sign in
    </button>
  );
};
