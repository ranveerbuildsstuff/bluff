import { describe, it, expect } from 'vitest';
import { PlayerNameSchema } from '@bluff/shared';

describe('Player Name Validation', () => {
  it('accepts valid trimmed names between 1 and 16 characters', () => {
    expect(PlayerNameSchema.parse('Alice')).toBe('Alice');
    expect(PlayerNameSchema.parse('A')).toBe('A');
    expect(PlayerNameSchema.parse('1234567890123456')).toBe('1234567890123456');
    expect(PlayerNameSchema.parse('  Bob  ')).toBe('Bob');
  });

  it('rejects empty strings and whitespace-only strings', () => {
    expect(() => PlayerNameSchema.parse('')).toThrow();
    expect(() => PlayerNameSchema.parse('   ')).toThrow();
  });

  it('rejects names exceeding 16 characters after trimming', () => {
    expect(() => PlayerNameSchema.parse('ThisNameIsWayTooLong')).toThrow();
    expect(() => PlayerNameSchema.parse('12345678901234567')).toThrow();
  });
});
