import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const appId = import.meta.env.VITE_FIREBASE_APP_ID;

export const isAccountsConfigured: boolean = Boolean(
  apiKey && authDomain && projectId && appId
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isAccountsConfigured) {
  try {
    app = getApps().length
      ? getApp()
      : initializeApp({
          apiKey,
          authDomain,
          projectId,
          appId,
        });
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } catch {
    app = null;
    auth = null;
    googleProvider = null;
  }
}

export { auth, googleProvider };

export function getFriendlyAuthErrorMessage(
  error: unknown,
  isGooglePopup: boolean = false
): string {
  if (isGooglePopup) {
    return "Google sign-in didn't open. Allow pop-ups, or open this link in Chrome or Safari, or use email and password instead.";
  }
  if (!error || typeof error !== 'object') {
    return 'Unable to sign in. Please try again.';
  }
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';

  if (
    code === 'auth/popup-blocked' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  ) {
    return "Google sign-in didn't open. Allow pop-ups, or open this link in Chrome or Safari, or use email and password instead.";
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Try signing in.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'Incorrect email or password.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 8 characters.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error. Please check your connection and try again.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please try again in a few minutes.';
  }
  return 'Unable to sign in. Please try again.';
}

export async function getFreshIdToken(): Promise<string | null> {
  if (!auth || !auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth || !googleProvider) {
    throw new Error('Authentication is not configured');
  }
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err) {
    throw new Error(getFriendlyAuthErrorMessage(err, true));
  }
}

export async function signInEmailPassword(
  email: string,
  pass: string
): Promise<User> {
  if (!auth) {
    throw new Error('Authentication is not configured');
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    return cred.user;
  } catch (err) {
    throw new Error(getFriendlyAuthErrorMessage(err, false));
  }
}

export async function createEmailPasswordAccount(
  email: string,
  pass: string
): Promise<User> {
  if (!auth) {
    throw new Error('Authentication is not configured');
  }
  if (pass.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    return cred.user;
  } catch (err) {
    throw new Error(getFriendlyAuthErrorMessage(err, false));
  }
}

export async function resetPassword(email: string): Promise<void> {
  if (!auth) {
    throw new Error('Authentication is not configured');
  }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    throw new Error(getFriendlyAuthErrorMessage(err, false));
  }
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await firebaseSignOut(auth);
}

export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
