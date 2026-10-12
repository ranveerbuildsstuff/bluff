import { randomUUID } from 'crypto';

export function createPlayerId(): string {
  return randomUUID();
}

export function createSessionToken(): string {
  return `${randomUUID()}-${randomUUID()}`;
}
