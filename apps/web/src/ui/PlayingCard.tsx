import React from 'react';
import type { Rank, Suit } from '@bluff/shared';

export interface PlayingCardProps extends React.HTMLAttributes<HTMLDivElement> {
  rank?: Rank | string;
  suit?: Suit | string;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  selected?: boolean;
  label?: string;
}

export const SuitIcon: React.FC<{ suit: Suit | string; className?: string }> = ({ suit, className = 'w-4 h-4' }) => {
  switch (suit) {
    case 'H':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    case 'D':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L3 12l9 10 9-10L12 2z" />
        </svg>
      );
    case 'C':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.5 9.5c0-1.93-1.57-3.5-3.5-3.5-.4 0-.78.07-1.13.19C14.49 4.38 12.92 3 11 3S7.51 4.38 7.13 6.19c-.35-.12-.73-.19-1.13-.19-1.93 0-3.5 1.57-3.5 3.5 0 1.55 1.01 2.86 2.42 3.31-.05.23-.08.46-.08.7 0 2.22 1.63 4.07 3.77 4.42L7.5 21h7l-1.11-3.07c2.14-.35 3.77-2.2 3.77-4.42 0-.24-.03-.47-.08-.7 1.41-.45 2.42-1.76 2.42-3.31z" />
        </svg>
      );
    case 'S':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.5C9.5 6 4 10.5 4 14.5c0 2.5 1.8 4.5 4.5 4.5 1.2 0 2.4-.5 3.5-1.5l-1 3.5h2l-1-3.5c1.1 1 2.3 1.5 3.5 1.5 2.7 0 4.5-2 4.5-4.5 0-4-5.5-8.5-8-12z" />
        </svg>
      );
    default:
      return null;
  }
};

export const PlayingCard: React.FC<PlayingCardProps> = ({
  rank = 'A',
  suit = 'S',
  faceDown = false,
  size = 'md',
  selected = false,
  label,
  className = '',
  style,
  ...props
}) => {
  const isRed = suit === 'H' || suit === 'D';
  const colorClass = isRed ? 'text-[#E11D48]' : 'text-[#0F172A]';

  const sizeClasses = {
    sm: 'w-12 h-16 rounded-lg text-xs',
    md: 'w-16 h-22 rounded-xl text-sm',
    lg: 'w-20 h-28 rounded-2xl text-base',
    xl: 'w-24 h-34 rounded-2xl text-lg',
  }[size];

  if (faceDown) {
    return (
      <div
        className={`relative select-none shrink-0 ${sizeClasses} rounded-xl border-2 border-indigo-400/40 bg-[#1E1138] shadow-card overflow-hidden transition-all duration-200 ${
          selected ? 'ring-2 ring-[#F5B942] -translate-y-2' : ''
        } ${className}`}
        style={style}
        {...props}
      >
        {/* Intricate Card Back SVG Pattern */}
        <div className="absolute inset-1 rounded-lg border border-indigo-300/30 overflow-hidden bg-gradient-to-br from-[#2D1254] via-[#1B0B38] to-[#120626] flex items-center justify-center">
          <svg className="w-full h-full opacity-35" viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="card-pattern" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 0 5 L 5 0 L 10 5 L 5 10 Z" fill="none" stroke="#A855F7" strokeWidth="0.8" />
                <circle cx="5" cy="5" r="1" fill="#C084FC" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#card-pattern)" />
            <circle cx="30" cy="40" r="14" fill="#250E46" stroke="#A855F7" strokeWidth="1" />
            <path d="M 30 30 L 37 40 L 30 50 L 23 40 Z" fill="#7C3AED" stroke="#E9D5FF" strokeWidth="0.8" />
          </svg>
        </div>

        {label && (
          <div className="absolute inset-x-0 bottom-1 flex justify-center z-10 px-1">
            <span className="bg-[#0B0716]/90 border border-purple-400/40 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-md truncate shadow">
              {label}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative select-none shrink-0 ${sizeClasses} bg-[#FAF9F6] border border-slate-300 shadow-card flex flex-col justify-between p-1.5 transition-all duration-200 ${colorClass} ${
        selected ? 'ring-2 ring-[#F5B942] -translate-y-2' : ''
      } ${className}`}
      style={style}
      {...props}
    >
      {/* Top Left Corner Index */}
      <div className="flex flex-col items-center leading-none">
        <span className="font-black tracking-tight">{rank}</span>
        <SuitIcon suit={suit} className="w-2.5 h-2.5 mt-0.5" />
      </div>

      {/* Center Suit Art */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-90">
        <SuitIcon
          suit={suit}
          className={size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-7 h-7' : 'w-9 h-9'}
        />
      </div>

      {/* Bottom Right Inverted Index */}
      <div className="flex flex-col items-center leading-none rotate-180 self-end">
        <span className="font-black tracking-tight">{rank}</span>
        <SuitIcon suit={suit} className="w-2.5 h-2.5 mt-0.5" />
      </div>

      {label && (
        <div className="absolute inset-x-0 -bottom-2 flex justify-center z-10 px-1">
          <span className="bg-[#1A1030] border border-purple-400/40 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-md truncate shadow">
            {label}
          </span>
        </div>
      )}
    </div>
  );
};
