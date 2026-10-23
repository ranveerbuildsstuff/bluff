import { Auth } from 'firebase-admin/auth';
import {
  Firestore,
  FieldValue,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';
import {
  calculateWinRate,
  LeaderboardEntry,
  StatsStore,
  TokenVerifier,
  UserStats,
  VerifiedUser,
} from './types.js';

export class FirebaseTokenVerifier implements TokenVerifier {
  constructor(private auth: Auth) {}

  async verify(idToken: string): Promise<VerifiedUser> {
    try {
      const decoded = await this.auth.verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        name: decoded.name,
      };
    } catch {
      throw new Error('AUTH_FAILED');
    }
  }
}

export class FirestoreStatsStore implements StatsStore {
  constructor(private db: Firestore) {}

  async ensureUser(uid: string, initialDisplayName?: string): Promise<UserStats> {
    const userRef = this.db.collection('users').doc(uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      const now = Date.now();
      const displayName = (initialDisplayName?.trim() || 'Player').slice(0, 16);
      const data = {
        displayName,
        gamesPlayed: 0,
        wins: 0,
        createdAt: now,
        updatedAt: now,
      };
      await userRef.set(data);
      return {
        ...data,
        winRate: 0,
      };
    }

    const data = snap.data()!;
    const wins = typeof data.wins === 'number' ? data.wins : 0;
    const gamesPlayed = typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 0;
    return {
      displayName: (data.displayName?.trim() || 'Player').slice(0, 16),
      gamesPlayed,
      wins,
      winRate: calculateWinRate(wins, gamesPlayed),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async recordGame(
    uid: string,
    gameId: string,
    won: boolean
  ): Promise<{ gamesPlayed: number; wins: number }> {
    const userRef = this.db.collection('users').doc(uid);
    const markerRef = userRef.collection('games').doc(gameId);

    return await this.db.runTransaction(async (t: Transaction) => {
      const markerSnap = await t.get(markerRef);
      const userSnap = await t.get(userRef);

      let currentGamesPlayed = 0;
      let currentWins = 0;
      let displayName = 'Player';
      const now = Date.now();

      if (userSnap.exists) {
        const u = userSnap.data()!;
        currentGamesPlayed = typeof u.gamesPlayed === 'number' ? u.gamesPlayed : 0;
        currentWins = typeof u.wins === 'number' ? u.wins : 0;
        displayName = u.displayName || 'Player';
      }

      if (markerSnap.exists) {
        // Idempotency: marker exists, do not double count
        return { gamesPlayed: currentGamesPlayed, wins: currentWins };
      }

      const newGamesPlayed = currentGamesPlayed + 1;
      const newWins = currentWins + (won ? 1 : 0);

      t.set(markerRef, {
        recordedAt: now,
        won,
      });

      if (!userSnap.exists) {
        t.set(userRef, {
          displayName,
          gamesPlayed: newGamesPlayed,
          wins: newWins,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        t.update(userRef, {
          gamesPlayed: FieldValue.increment(1),
          wins: won ? FieldValue.increment(1) : currentWins,
          updatedAt: now,
        });
      }

      return { gamesPlayed: newGamesPlayed, wins: newWins };
    });
  }

  async getStats(uid: string): Promise<UserStats | null> {
    const snap = await this.db.collection('users').doc(uid).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    const wins = typeof data.wins === 'number' ? data.wins : 0;
    const gamesPlayed = typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 0;
    return {
      displayName: (data.displayName?.trim() || 'Player').slice(0, 16),
      gamesPlayed,
      wins,
      winRate: calculateWinRate(wins, gamesPlayed),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const snap = await this.db
      .collection('users')
      .orderBy('wins', 'desc')
      .limit(Math.max(limit * 3, 100))
      .get();

    const entries = snap.docs
      .map((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        const wins = typeof data.wins === 'number' ? data.wins : 0;
        const gamesPlayed = typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 0;
        return {
          displayName: (data.displayName?.trim() || 'Player').slice(0, 16),
          wins,
          gamesPlayed,
          winRate: calculateWinRate(wins, gamesPlayed),
        };
      })
      // Only include users who have played at least one game
      .filter((e) => e.gamesPlayed >= 1);

    entries.sort(
      (
        a: { wins: number; winRate: number; displayName: string },
        b: { wins: number; winRate: number; displayName: string }
      ) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return a.displayName.localeCompare(b.displayName);
      }
    );

    return entries.slice(0, limit).map((entry, index: number) => ({
      rank: index + 1,
      displayName: entry.displayName,
      wins: entry.wins,
      gamesPlayed: entry.gamesPlayed,
      winRate: entry.winRate,
    }));
  }

  async setDisplayName(uid: string, name: string): Promise<UserStats> {
    const userRef = this.db.collection('users').doc(uid);
    const now = Date.now();
    const cleanName = (name.trim() || 'Player').slice(0, 16);
    await userRef.set({ displayName: cleanName, updatedAt: now }, { merge: true });
    const snap = await userRef.get();
    const data = snap.data()!;
    const wins = typeof data.wins === 'number' ? data.wins : 0;
    const gamesPlayed = typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 0;
    return {
      displayName: (data.displayName?.trim() || cleanName).slice(0, 16),
      gamesPlayed,
      wins,
      winRate: calculateWinRate(wins, gamesPlayed),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async deleteUser(uid: string): Promise<void> {
    const userRef = this.db.collection('users').doc(uid);
    const gamesSnap = await userRef.collection('games').get();
    const batch = this.db.batch();
    for (const doc of gamesSnap.docs) {
      batch.delete(doc.ref);
    }
    batch.delete(userRef);
    await batch.commit();
  }
}
