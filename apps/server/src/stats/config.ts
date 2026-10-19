import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { StatsStore, TokenVerifier } from './types.js';
import { NoopStatsStore, NoopTokenVerifier } from './noop.js';
import { FirebaseTokenVerifier, FirestoreStatsStore } from './firestore.js';

export interface StatsService {
  enabled: boolean;
  store: StatsStore;
  verifier: TokenVerifier;
}

export function getMinRankedPlayers(): number {
  const val = process.env.MIN_RANKED_PLAYERS;
  if (!val) return 3;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) || parsed <= 0 ? 3 : parsed;
}

export function initStatsService(
  serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
): StatsService {
  if (
    !serviceAccountJson ||
    typeof serviceAccountJson !== 'string' ||
    !serviceAccountJson.trim()
  ) {
    console.log('Accounts: disabled');
    return {
      enabled: false,
      store: new NoopStatsStore(),
      verifier: new NoopTokenVerifier(),
    };
  }

  try {
    const parsed = JSON.parse(serviceAccountJson);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.project_id ||
      !parsed.private_key ||
      !parsed.client_email
    ) {
      console.log('Accounts: disabled');
      return {
        enabled: false,
        store: new NoopStatsStore(),
        verifier: new NoopTokenVerifier(),
      };
    }

    if (
      typeof parsed.private_key === 'string' &&
      parsed.private_key.includes('\\n')
    ) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }

    const apps = getApps();
    let app: App;
    if (apps.length > 0 && apps[0]) {
      app = apps[0];
    } else {
      app = initializeApp({
        credential: cert(parsed),
      });
    }

    const firestore = getFirestore(app);
    const auth = getAuth(app);

    console.log('Accounts: enabled');
    return {
      enabled: true,
      store: new FirestoreStatsStore(firestore),
      verifier: new FirebaseTokenVerifier(auth),
    };
  } catch {
    // NEVER print the value or the parse error!
    console.log('Accounts: disabled');
    return {
      enabled: false,
      store: new NoopStatsStore(),
      verifier: new NoopTokenVerifier(),
    };
  }
}
