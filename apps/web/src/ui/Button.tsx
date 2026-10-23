import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled = false,
  children,
  className = '',
  type = 'button',
  ...props
}) => {
  const isDisabled = disabled || isLoading;

  const sizeClasses = {
    sm: 'min-h-[44px] px-3.5 py-1.5 text-xs font-semibold rounded-xl',
    md: 'min-h-[44px] sm:min-h-[48px] px-4 py-2.5 text-sm font-bold rounded-xl',
    lg: 'min-h-[48px] sm:min-h-[52px] px-6 py-3.5 text-base font-extrabold rounded-2xl',
  }[size];

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white shadow-primary-glow hover:brightness-110 active:brightness-95 border border-purple-400/30',
    secondary:
      'bg-[#221440] hover:bg-[#2a1950] active:bg-[#1d1038] text-[#F5F3FF] border border-[rgba(167,139,250,0.18)] shadow-sm',
    ghost:
      'bg-transparent hover:bg-white/5 active:bg-white/10 text-[#A89BC8] hover:text-[#F5F3FF] border border-transparent',
    danger:
      'bg-[#F43F5E] hover:bg-[#fb4f6d] active:bg-[#e11d48] text-white shadow-danger-glow border border-rose-400/30',
  }[variant];

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading}
      style={{ touchAction: 'manipulation' }}
      className={`relative inline-flex items-center justify-center gap-2 select-none transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0716] ${sizeClasses} ${variantClasses} ${
        fullWidth ? 'w-full' : ''
      } ${isDisabled ? 'opacity-50 cursor-not-allowed active:scale-100' : 'cursor-pointer'} ${className}`}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
};
