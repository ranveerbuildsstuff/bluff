import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'surface-2';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = 'surface',
  padding = 'md',
  children,
  className = '',
  ...props
}) => {
  const bgClasses = variant === 'surface-2' ? 'bg-[#221440]' : 'bg-[#1A1030]';

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6',
  }[padding];

  return (
    <div
      className={`rounded-2xl border border-[rgba(167,139,250,0.18)] shadow-card backdrop-blur-md ${bgClasses} ${paddingClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
