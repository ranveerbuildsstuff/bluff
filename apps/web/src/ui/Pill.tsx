import React from 'react';

export type PillVariant = 'primary' | 'secondary' | 'gold' | 'danger' | 'success' | 'muted';

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
  children: React.ReactNode;
}

export const Pill: React.FC<PillProps> = ({
  variant = 'secondary',
  children,
  className = '',
  ...props
}) => {
  const variantClasses = {
    primary: 'bg-[#7C3AED]/20 text-[#C084FC] border-[#A855F7]/30',
    secondary: 'bg-[#221440] text-[#F5F3FF] border-[rgba(167,139,250,0.2)]',
    gold: 'bg-[#F5B942]/15 text-[#F5B942] border-[#F5B942]/30',
    danger: 'bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/30',
    success: 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30',
    muted: 'bg-white/5 text-[#A89BC8] border-white/10',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border tracking-wide select-none ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
