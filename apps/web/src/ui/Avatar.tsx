import React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const PALETTE = [
  { bg: 'bg-violet-600/30', text: 'text-violet-300', border: 'border-violet-400/40' },
  { bg: 'bg-fuchsia-600/30', text: 'text-fuchsia-300', border: 'border-fuchsia-400/40' },
  { bg: 'bg-indigo-600/30', text: 'text-indigo-300', border: 'border-indigo-400/40' },
  { bg: 'bg-pink-600/30', text: 'text-pink-300', border: 'border-pink-400/40' },
  { bg: 'bg-amber-600/30', text: 'text-amber-300', border: 'border-amber-400/40' },
  { bg: 'bg-emerald-600/30', text: 'text-emerald-300', border: 'border-emerald-400/40' },
  { bg: 'bg-cyan-600/30', text: 'text-cyan-300', border: 'border-cyan-400/40' },
  { bg: 'bg-rose-600/30', text: 'text-rose-300', border: 'border-rose-400/40' },
];

export function hashNameColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = 'md',
  className = '',
  ...props
}) => {
  const initial = (name?.trim() || 'P').charAt(0).toUpperCase();
  const color = hashNameColor(name || 'Player');

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs font-bold',
    md: 'w-9 h-9 text-sm font-bold',
    lg: 'w-11 h-11 text-base font-extrabold',
  }[size];

  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center border shadow-sm select-none ${sizeClasses} ${color.bg} ${color.text} ${color.border} ${className}`}
      aria-label={`Avatar for ${name}`}
      {...props}
    >
      <span>{initial}</span>
    </div>
  );
};
