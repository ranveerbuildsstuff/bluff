import React, { useState } from 'react';
import {
  signInWithGoogle,
  signInEmailPassword,
  createEmailPasswordAccount,
  resetPassword,
} from '../firebase';

interface SignInSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SignInSheet: React.FC<SignInSheetProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfo(null);
    setIsLoading(true);
    try {
      await signInWithGoogle();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Google sign-in didn't open. Allow pop-ups, or open this link in Chrome or Safari, or use email and password instead.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'signup') {
        await createEmailPasswordAccount(cleanEmail, password);
      } else {
        await signInEmailPassword(cleanEmail, password);
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Enter your email above and tap Forgot password again.');
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(cleanEmail);
      setInfo('Password reset email sent! Check your inbox.');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Could not send reset email. Check your email address.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4">
      <div className="w-full sm:max-w-[380px] bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            {mode === 'signin' ? 'Sign in to Bluff' : 'Create an Account'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full text-slate-400 hover:text-white flex items-center justify-center text-lg min-h-[44px] min-w-[44px]"
            style={{ touchAction: 'manipulation' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-5">
          Save your wins, appear on the leaderboard, and track your match history across devices.
        </p>

        {/* Feedback Messages */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium leading-relaxed">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium leading-relaxed">
            {info}
          </div>
        )}

        {/* Google Sign-in */}
        <button
          type="button"
          disabled={isLoading}
          onClick={handleGoogleSignIn}
          className="w-full min-h-[48px] px-4 rounded-xl bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-900 font-semibold text-sm shadow-md transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
          style={{ touchAction: 'manipulation' }}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-5">
          <div className="border-t border-slate-700 w-full" />
          <span className="bg-slate-900 px-3 text-xs uppercase font-medium text-slate-500 tracking-wider absolute">
            or with email
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
            >
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full px-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ minHeight: '48px' }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Password
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-indigo-400 hover:text-indigo-300 active:text-indigo-500 font-medium"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="w-full px-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ minHeight: '48px' }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 transition-colors flex items-center justify-center disabled:opacity-50 mt-2"
            style={{ touchAction: 'manipulation' }}
          >
            {isLoading
              ? 'Please wait...'
              : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
          </button>
        </form>

        {/* Toggle signin / signup */}
        <div className="mt-4 text-center">
          {mode === 'signin' ? (
            <p className="text-xs text-slate-400">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setInfo(null);
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 ml-1 min-h-[44px] inline-flex items-center"
              >
                Create account
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setInfo(null);
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 ml-1 min-h-[44px] inline-flex items-center"
              >
                Sign in
              </button>
            </p>
          )}
        </div>

        {/* Not now button */}
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 active:text-white font-medium min-h-[44px] flex items-center justify-center transition-colors"
            style={{ touchAction: 'manipulation' }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};
