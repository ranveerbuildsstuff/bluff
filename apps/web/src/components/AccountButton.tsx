import React from 'react';

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
    const letter = (displayName || 'P').charAt(0).toUpperCase();
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Account Profile"
        className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-1 rounded-full transition-transform active:scale-95 ${className}`}
        style={{ touchAction: 'manipulation' }}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-600 border border-indigo-400 text-white font-bold text-sm flex items-center justify-center shadow-md">
          {letter}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 active:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white flex items-center justify-center shadow-sm transition-colors ${className}`}
      style={{ touchAction: 'manipulation' }}
    >
      Sign in
    </button>
  );
};
