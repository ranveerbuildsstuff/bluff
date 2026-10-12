import React from 'react';

export interface ToastItem {
  id: string;
  message: string;
  type: 'error' | 'info';
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => onDismiss(toast.id)}
          className={`pointer-events-auto max-w-sm w-full p-4 rounded-xl shadow-2xl flex items-center justify-between text-sm font-medium transition-all transform animate-bounce-in cursor-pointer border ${
            toast.type === 'error'
              ? 'bg-rose-950/90 text-rose-100 border-rose-500/40 backdrop-blur-md'
              : 'bg-emerald-950/90 text-emerald-100 border-emerald-500/40 backdrop-blur-md'
          }`}
          style={{ minHeight: '44px' }}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'error' ? (
              <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-200 p-1 -mr-1"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(toast.id);
            }}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
