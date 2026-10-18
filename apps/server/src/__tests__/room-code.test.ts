import { describe, it, expect } from 'vitest';
import { generateRandomCode, generateUniqueRoomCode } from '../engine/room-code.js';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@bluff/shared';

describe('Room Code Generator', () => {
  it('generates codes with correct length and alphabet', () => {
    const code = generateRandomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const char of code) {
      expect(ROOM_CODE_ALPHABET).toContain(char);
    }
  });

  it('contains no forbidden characters (0, O, 1, I)', () => {
    const forbidden = ['0', 'O', '1', 'I'];
    for (const char of forbidden) {
      expect(ROOM_CODE_ALPHABET).not.toContain(char);
    }
  });

  it('produces no collisions over 10,000 generations', () => {
    const existing = new Set<string>();
    const count = 10000;

    for (let i = 0; i < count; i++) {
      const code = generateUniqueRoomCode((c) => existing.has(c));
      expect(code).toHaveLength(6);
      expect(/^[A-HJ-NP-Z2-9]{6}$/.test(code)).toBe(true);
      expect(existing.has(code)).toBe(false);
      existing.add(code);
    }

    expect(existing.size).toBe(count);
  });

  it('regenerates on collision against existing room codes', () => {
    const existing = new Set<string>(['ABCDEF']);
    let attempts = 0;
    // Force a collision on the first attempt
    const mockRandom = () => {
      // Return predictable indices for 'ABCDEF' on first call, 'BCDEFG' on second
      if (attempts < 6) {
        const val = attempts / ROOM_CODE_ALPHABET.length;
        attempts++;
        return val;
      }
      const val = (attempts - 5) / ROOM_CODE_ALPHABET.length;
      attempts++;
      return val;
    };

    const code = generateUniqueRoomCode((c) => existing.has(c), mockRandom);
    expect(code).not.toBe('ABCDEF');
    expect(code).toBe('BCDEFG');
  });

  it('throws error if unique code cannot be generated within maxAttempts', () => {
    expect(() => generateUniqueRoomCode(() => true, undefined, 5)).toThrow(
      'Failed to generate a unique room code after maximum attempts'
    );
  });
});
