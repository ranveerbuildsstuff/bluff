import { describe, it, expect } from 'vitest';
import { rankLabel } from '../index.js';

describe('rankLabel helper', () => {
  it('returns singular form when count is 1 for A, J, Q, K, 2, 10', () => {
    expect(rankLabel('A', 1)).toBe('Ace');
    expect(rankLabel('J', 1)).toBe('Jack');
    expect(rankLabel('Q', 1)).toBe('Queen');
    expect(rankLabel('K', 1)).toBe('King');
    expect(rankLabel('2', 1)).toBe('2');
    expect(rankLabel('10', 1)).toBe('10');
  });

  it('returns plural form when count is not 1 for A, J, Q, K, 2, 10', () => {
    expect(rankLabel('A', 2)).toBe('Aces');
    expect(rankLabel('J', 2)).toBe('Jacks');
    expect(rankLabel('Q', 2)).toBe('Queens');
    expect(rankLabel('K', 2)).toBe('Kings');
    expect(rankLabel('2', 2)).toBe('2s');
    expect(rankLabel('10', 2)).toBe('10s');

    // Also verify with higher count and default count parameter
    expect(rankLabel('A', 4)).toBe('Aces');
    expect(rankLabel('A')).toBe('Aces');
    expect(rankLabel('7', 3)).toBe('7s');
  });
});
