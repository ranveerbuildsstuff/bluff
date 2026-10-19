import { describe, it, expect } from 'vitest';
import {
  pluralize,
  isValidRoomCode,
  normalizeRoomCode,
  buildRoomLink,
  resolveRoomPrefill,
} from '../index.js';

describe('pluralize helper', () => {
  it('returns singular form when count is 1', () => {
    expect(pluralize(1, 'player')).toBe('1 player');
    expect(pluralize(1, 'card')).toBe('1 card');
  });

  it('returns default plural (singular + s) when count is not 1', () => {
    expect(pluralize(0, 'player')).toBe('0 players');
    expect(pluralize(2, 'player')).toBe('2 players');
    expect(pluralize(8, 'player')).toBe('8 players');
    expect(pluralize(0, 'card')).toBe('0 cards');
    expect(pluralize(5, 'card')).toBe('5 cards');
  });

  it('supports explicit custom plural string', () => {
    expect(pluralize(1, 'person', 'people')).toBe('1 person');
    expect(pluralize(2, 'person', 'people')).toBe('2 people');
    expect(pluralize(0, 'person', 'people')).toBe('0 people');
  });
});

describe('room code validator', () => {
  it('validates 6-character room codes from the alphabet', () => {
    expect(isValidRoomCode('ABC234')).toBe(true);
    expect(isValidRoomCode('K9X7P2')).toBe(true);
    expect(normalizeRoomCode('ABC234')).toBe('ABC234');
    expect(normalizeRoomCode('K9X7P2')).toBe('K9X7P2');
  });

  it('accepts lowercase room codes and normalizes them to uppercase', () => {
    expect(isValidRoomCode('abc234')).toBe(true);
    expect(isValidRoomCode('k9x7p2')).toBe(true);
    expect(normalizeRoomCode('abc234')).toBe('ABC234');
    expect(normalizeRoomCode('k9x7p2')).toBe('K9X7P2');
  });

  it('rejects room codes with wrong length', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('A')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('ABCDEF2')).toBe(false);
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode('ABCDE')).toBeNull();
    expect(normalizeRoomCode('ABCDEFG')).toBeNull();
  });

  it('rejects room codes containing invalid characters (0, O, 1, I, symbols)', () => {
    // Excluded characters: 0, O, 1, I
    expect(isValidRoomCode('ABC023')).toBe(false);
    expect(isValidRoomCode('ABCO23')).toBe(false);
    expect(isValidRoomCode('ABC123')).toBe(false);
    expect(isValidRoomCode('ABCI23')).toBe(false);
    // Symbols and spaces inside
    expect(isValidRoomCode('ABC!23')).toBe(false);
    expect(isValidRoomCode('AB 234')).toBe(false);
    expect(isValidRoomCode('ABC_23')).toBe(false);
    expect(normalizeRoomCode('ABC023')).toBeNull();
    expect(normalizeRoomCode('ABCO23')).toBeNull();
    expect(normalizeRoomCode('ABC123')).toBeNull();
    expect(normalizeRoomCode('ABCI23')).toBeNull();
  });

  it('rejects non-string inputs safely', () => {
    expect(isValidRoomCode(null)).toBe(false);
    expect(isValidRoomCode(undefined)).toBe(false);
    expect(isValidRoomCode(123456)).toBe(false);
    expect(isValidRoomCode({})).toBe(false);
    expect(normalizeRoomCode(null)).toBeNull();
    expect(normalizeRoomCode(undefined)).toBeNull();
    expect(normalizeRoomCode(123456)).toBeNull();
    expect(normalizeRoomCode({})).toBeNull();
  });
});

describe('link building (buildRoomLink)', () => {
  it('builds full join link with origin and room query param', () => {
    expect(buildRoomLink('http://localhost:3000', 'ABC234')).toBe(
      'http://localhost:3000/?room=ABC234'
    );
    expect(buildRoomLink('https://bluff.games', 'K9X7P2')).toBe(
      'https://bluff.games/?room=K9X7P2'
    );
  });

  it('uppercases and trims room code in generated link', () => {
    expect(buildRoomLink('http://localhost:3000', 'abc234')).toBe(
      'http://localhost:3000/?room=ABC234'
    );
    expect(buildRoomLink('http://localhost:3000', '  k9x7p2  ')).toBe(
      'http://localhost:3000/?room=K9X7P2'
    );
  });
});

describe('prefill logic (resolveRoomPrefill)', () => {
  it('extracts valid room code in uppercase and provides cleanedUrl without room parameter', () => {
    const result = resolveRoomPrefill('?room=ABC234');
    expect(result.prefilledCode).toBe('ABC234');
    expect(result.cleanedUrl).toBe('/');
  });

  it('handles lowercase room codes and normalizes them to uppercase', () => {
    const result = resolveRoomPrefill('?room=abc234');
    expect(result.prefilledCode).toBe('ABC234');
    expect(result.cleanedUrl).toBe('/');
  });

  it('preserves existing path and hash while stripping room param', () => {
    const result = resolveRoomPrefill('?room=k9x7p2', '/play', '#help');
    expect(result.prefilledCode).toBe('K9X7P2');
    expect(result.cleanedUrl).toBe('/play#help');
  });

  it('preserves other query parameters', () => {
    const result = resolveRoomPrefill('?theme=dark&room=abc234&ref=share');
    expect(result.prefilledCode).toBe('ABC234');
    expect(result.cleanedUrl).toBe('/?theme=dark&ref=share');
  });

  it('silently ignores invalid room codes (wrong chars, wrong length)', () => {
    expect(resolveRoomPrefill('?room=ABC023')).toEqual({
      prefilledCode: null,
      cleanedUrl: null,
    });
    expect(resolveRoomPrefill('?room=short')).toEqual({
      prefilledCode: null,
      cleanedUrl: null,
    });
    expect(resolveRoomPrefill('?room=toolongcode')).toEqual({
      prefilledCode: null,
      cleanedUrl: null,
    });
  });

  it('returns nulls when room parameter is missing or empty', () => {
    expect(resolveRoomPrefill('')).toEqual({
      prefilledCode: null,
      cleanedUrl: null,
    });
    expect(resolveRoomPrefill('?foo=bar')).toEqual({
      prefilledCode: null,
      cleanedUrl: null,
    });
    expect(resolveRoomPrefill('?room=')).toEqual({
      prefilledCode: null,
      cleanedUrl: null,
    });
  });
});
