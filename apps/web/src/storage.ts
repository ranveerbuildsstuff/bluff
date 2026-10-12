import { SessionIssued } from '@bluff/shared';

const SESSION_KEY = 'bluff_session';
const NAME_KEY = 'bluff_player_name';

export function saveSession(session: SessionIssued): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save session to localStorage', e);
  }
}

export function getSession(): SessionIssued | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionIssued;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.error('Failed to clear session from localStorage', e);
  }
}

export function saveSavedName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch (e) {
    console.error('Failed to save name to localStorage', e);
  }
}

export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}
