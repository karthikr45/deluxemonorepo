import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOYALTY_CONFIG,
  pointsToZar,
  quoteRedemption,
  zarToPoints,
} from './loyalty';

describe('loyalty math', () => {
  it('converts 100 points to R3.00', () => {
    expect(pointsToZar(100)).toBe(3);
    expect(pointsToZar(450)).toBe(13.5);
    expect(pointsToZar(0)).toBe(0);
  });

  it('converts Rand back to points (ceil)', () => {
    expect(zarToPoints(3)).toBe(100);
    expect(zarToPoints(3.01)).toBe(101);
  });

  it('rejects non-positive points', () => {
    const r = quoteRedemption(0, 500, new Date('2026-01-01'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NON_POSITIVE');
  });

  it('rejects below the minimum', () => {
    const r = quoteRedemption(50, 500, new Date('2026-01-01'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('BELOW_MINIMUM');
  });

  it('rejects non-multiples of the point unit', () => {
    const r = quoteRedemption(150, 500, new Date('2026-01-01'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NOT_A_MULTIPLE');
  });

  it('rejects redemptions above the available balance', () => {
    const r = quoteRedemption(600, 500, new Date('2026-01-01'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INSUFFICIENT_BALANCE');
  });

  it('quotes a valid redemption with a 6-month expiry', () => {
    const issuedAt = new Date('2026-01-15T00:00:00.000Z');
    const r = quoteRedemption(300, 500, issuedAt);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.quote.points).toBe(300);
      expect(r.quote.amountZar).toBe(9);
      expect(r.quote.currency).toBe('ZAR');
      const expected = new Date(issuedAt);
      expected.setMonth(expected.getMonth() + DEFAULT_LOYALTY_CONFIG.codeValidityMonths);
      expect(r.quote.expiresAt.toISOString()).toBe(expected.toISOString());
    }
  });
});
