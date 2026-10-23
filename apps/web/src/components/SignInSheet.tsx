import React, { useState } from 'react';
import {
  signInWithGoogle,
  signInEmailPassword,
  createEmailPasswordAccount,
  resetPassword,
} from '../firebase';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';

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
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'signin' ? 'Sign in to Bluff' : 'Create an Account'}
      subtitle="Save your wins, appear on the leaderboard, and track your match history across devices."
    >
      <div className="space-y-4">
        {/* Feedback Messages */}
        {error && (
          <div className="p-3 rounded-xl bg-[#F43F5E]/15 border border-[#F43F5E]/30 text-rose-300 text-xs font-medium leading-relaxed">
            {error}
          </div>
        )}
        {info && (
          <div className="p-3 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30 text-emerald-300 text-xs font-medium leading-relaxed">
            {info}
          </div>
        )}

        {/* Google Sign-in */}
        <button
          type="button"
          disabled={isLoading}
          onClick={handleGoogleSignIn}
          className="w-full min-h-[48px] px-4 rounded-xl bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-900 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-3 disabled:opacity-50 select-none"
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
        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-[rgba(167,139,250,0.18)] w-full" />
          <span className="bg-[#1A1030] px-3 text-[11px] uppercase font-bold text-[#A89BC8] tracking-wider absolute">
            or with email
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-bold text-[#A89BC8] uppercase tracking-wider mb-1.5"
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
              className="w-full px-3.5 rounded-xl bg-[#221440] border border-[rgba(167,139,250,0.2)] text-[#F5F3FF] placeholder-[#A89BC8]/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#A855F7] min-h-[48px]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="auth-password"
                className="block text-xs font-bold text-[#A89BC8] uppercase tracking-wider"
              >
                Password
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-[#A855F7] hover:text-purple-300 active:text-purple-400 font-medium min-h-[30px]"
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
              className="w-full px-3.5 rounded-xl bg-[#221440] border border-[rgba(167,139,250,0.2)] text-[#F5F3FF] placeholder-[#A89BC8]/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#A855F7] min-h-[48px]"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            isLoading={isLoading}
            className="mt-2"
          >
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {/* Toggle signin / signup */}
        <div className="mt-4 text-center">
          {mode === 'signin' ? (
            <p className="text-xs text-[#A89BC8]">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setInfo(null);
                }}
                className="text-[#A855F7] hover:text-purple-300 font-bold underline underline-offset-2 ml-1 min-h-[44px] inline-flex items-center"
              >
                Create account
              </button>
            </p>
          ) : (
            <p className="text-xs text-[#A89BC8]">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setInfo(null);
                }}
                className="text-[#A855F7] hover:text-purple-300 font-bold underline underline-offset-2 ml-1 min-h-[44px] inline-flex items-center"
              >
                Sign in
              </button>
            </p>
          )}
        </div>

        {/* Not now button */}
        <div className="text-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={onClose}
            className="text-xs text-[#A89BC8]"
          >
            Not now
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
