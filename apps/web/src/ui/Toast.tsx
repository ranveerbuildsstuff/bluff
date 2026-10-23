import React from 'react';

export interface ToastProps {
  id: string;
  message: string;
  type?: 'error' | 'info' | 'success';
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type = 'info',
  onDismiss,
}) => {
  const isError = type === 'error';
  const isSuccess = type === 'success';

  const borderClass = isError
    ? 'border-[#F43F5E]/40 text-[#F5F3FF] shadow-danger-glow'
    : isSuccess
    ? 'border-[#22C55E]/40 text-[#F5F3FF]'
    : 'border-[rgba(167,139,250,0.3)] text-[#F5F3FF] shadow-primary-glow';

  return (
    <div
      onClick={() => onDismiss(id)}
      role="status"
      className={`pointer-events-auto max-w-sm w-full p-4 rounded-2xl bg-[#1A1030]/95 backdrop-blur-md border shadow-2xl flex items-center justify-between text-sm font-medium transition-all transform cursor-pointer min-h-[44px] ${borderClass}`}
      style={{ touchAction: 'manipulation' }}
    >
      <div className="flex items-center gap-3 min-w-0 pr-2">
        {isError ? (
          <div className="w-6 h-6 rounded-full bg-[#F43F5E]/20 text-[#F43F5E] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        ) : isSuccess ? (
          <div className="w-6 h-6 rounded-full bg-[#22C55E]/20 text-[#22C55E] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-[#7C3AED]/20 text-[#A855F7] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )}
        <span className="truncate">{message}</span>
      </div>

      <button
        type="button"
        className="text-[#A89BC8] hover:text-[#F5F3FF] p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7]"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(id);
        }}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
};
