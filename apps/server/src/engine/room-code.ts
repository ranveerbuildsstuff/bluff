import { randomInt } from 'crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@bluff/shared';

export function generateRandomCode(randomFn?: () => number): string {
  let code = '';
  const len = ROOM_CODE_ALPHABET.length;
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = randomFn ? Math.floor(randomFn() * len) : randomInt(0, len);
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

export function generateUniqueRoomCode(
  isCodeInUse: (code: string) => boolean,
  randomFn?: () => number,
  maxAttempts: number = 1000
): string {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateRandomCode(randomFn);
    if (!isCodeInUse(code)) {
      return code;
    }
  }
  throw new Error('Failed to generate a unique room code after maximum attempts');
}
