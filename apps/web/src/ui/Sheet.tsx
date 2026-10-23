import React, { useEffect, useRef } from 'react';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  fullScreen?: boolean;
  className?: string;
  hideCloseButton?: boolean;
  'aria-label'?: string;
}

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  fullScreen = false,
  className = '',
  hideCloseButton = false,
  'aria-label': ariaLabel,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus trap & Escape listener
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusableElements = sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus into sheet
    const timeout = setTimeout(() => {
      if (sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          sheetRef.current.focus();
        }
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeout);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const containerClasses = fullScreen
    ? 'fixed inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-lg sm:w-[94%] sm:rounded-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh]'
    : 'fixed inset-x-0 bottom-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-md sm:w-[94%] rounded-t-3xl sm:rounded-3xl max-h-[92dvh] sm:max-h-[85vh]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || (typeof title === 'string' ? title : 'Dialog')}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0B0716]/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content Container */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`${containerClasses} bg-[#1A1030] border-t sm:border border-[rgba(167,139,250,0.18)] shadow-2xl flex flex-col z-10 overflow-hidden outline-none animate-in fade-in zoom-in-95 duration-200 ${className}`}
      >
        {/* Mobile Pull Indicator (only for non-fullscreen bottom sheet) */}
        {!fullScreen && (
          <div className="w-12 h-1.5 bg-[#A89BC8]/30 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />
        )}

        {/* Optional Header */}
        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[rgba(167,139,250,0.1)] shrink-0">
            <div className="min-w-0 pr-2">
              {title && (
                <h2 className="text-lg font-black text-[#F5F3FF] tracking-tight truncate">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs text-[#A89BC8] mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>

            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="w-11 h-11 -mr-2 rounded-full text-[#A89BC8] hover:text-[#F5F3FF] hover:bg-white/5 active:bg-white/10 flex items-center justify-center transition-colors min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A855F7]"
                style={{ touchAction: 'manipulation' }}
                aria-label="Close dialog"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body content with scrollable area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
};
