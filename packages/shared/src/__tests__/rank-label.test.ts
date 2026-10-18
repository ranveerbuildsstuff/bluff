import { describe, it, expect } from 'vitest';
import { rankLabel, rankWithArticle, cardCountLabel, cardsWord, RANKS } from '../index.js';

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

describe('rankWithArticle helper', () => {
  it('uses "an" for Ace and 8', () => {
    expect(rankWithArticle('A')).toBe('an Ace');
    expect(rankWithArticle('8')).toBe('an 8');
  });

  it('uses "a" for named face cards', () => {
    expect(rankWithArticle('J')).toBe('a Jack');
    expect(rankWithArticle('Q')).toBe('a Queen');
    expect(rankWithArticle('K')).toBe('a King');
  });

  it('uses "a" for number cards 2 through 7, 9, 10', () => {
    expect(rankWithArticle('2')).toBe('a 2');
    expect(rankWithArticle('3')).toBe('a 3');
    expect(rankWithArticle('4')).toBe('a 4');
    expect(rankWithArticle('5')).toBe('a 5');
    expect(rankWithArticle('6')).toBe('a 6');
    expect(rankWithArticle('7')).toBe('a 7');
    expect(rankWithArticle('9')).toBe('a 9');
    expect(rankWithArticle('10')).toBe('a 10');
  });

  it('covers all 13 standard ranks', () => {
    for (const rank of RANKS) {
      expect(rankWithArticle(rank)).toBeDefined();
      expect(typeof rankWithArticle(rank)).toBe('string');
      expect(rankWithArticle(rank).startsWith('a ') || rankWithArticle(rank).startsWith('an ')).toBe(true);
    }
  });
});

describe('card count helpers', () => {
  it('cardCountLabel returns singular "1 card" for 1 and plural "N cards" for other counts', () => {
    expect(cardCountLabel(1)).toBe('1 card');
    expect(cardCountLabel(0)).toBe('0 cards');
    expect(cardCountLabel(2)).toBe('2 cards');
    expect(cardCountLabel(15)).toBe('15 cards');
  });

  it('cardsWord returns "Card" for 1 and "Cards" for other counts', () => {
    expect(cardsWord(1)).toBe('Card');
    expect(cardsWord(0)).toBe('Cards');
    expect(cardsWord(2)).toBe('Cards');
    expect(cardsWord(15)).toBe('Cards');
  });
});

