/**
 * Loyalty economics — single source of truth for the points <-> money math.
 *
 * Business rules (from Deluxe):
 *   - 100 points = R3.00 (ZAR)
 *   - Minimum redemption: 100 points
 *   - One discount code per order (Shopify usage limit = 1)
 *   - Codes valid for 6 months from date of issue
 */

export interface LoyaltyConfig {
  pointsPerUnit: number; // 100
  unitValueZar: number; // 3
  minRedeemPoints: number; // 100
  codeValidityMonths: number; // 6
  currency: string; // "ZAR"
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  pointsPerUnit: 100,
  unitValueZar: 3,
  minRedeemPoints: 100,
  codeValidityMonths: 6,
  currency: 'ZAR',
};

export function loadLoyaltyConfig(
  env: Record<string, string | undefined> = process.env,
): LoyaltyConfig {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    pointsPerUnit: num(env.LOYALTY_POINTS_PER_UNIT, DEFAULT_LOYALTY_CONFIG.pointsPerUnit),
    unitValueZar: num(env.LOYALTY_UNIT_VALUE_ZAR, DEFAULT_LOYALTY_CONFIG.unitValueZar),
    minRedeemPoints: num(env.LOYALTY_MIN_REDEEM_POINTS, DEFAULT_LOYALTY_CONFIG.minRedeemPoints),
    codeValidityMonths: num(
      env.LOYALTY_CODE_VALIDITY_MONTHS,
      DEFAULT_LOYALTY_CONFIG.codeValidityMonths,
    ),
    currency: env.LOYALTY_CURRENCY ?? DEFAULT_LOYALTY_CONFIG.currency,
  };
}

/** Rand value of a whole number of points, rounded to 2 decimals. */
export function pointsToZar(points: number, config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  const raw = (points / config.pointsPerUnit) * config.unitValueZar;
  return Math.round(raw * 100) / 100;
}

/** How many points are needed to yield the given Rand value (ceil). */
export function zarToPoints(zar: number, config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  return Math.ceil((zar / config.unitValueZar) * config.pointsPerUnit);
}

export interface RedemptionQuote {
  points: number;
  amountZar: number;
  currency: string;
  expiresAt: Date;
}

export type RedemptionValidationError =
  | 'BELOW_MINIMUM'
  | 'NOT_A_MULTIPLE'
  | 'INSUFFICIENT_BALANCE'
  | 'NON_POSITIVE';

/**
 * Validate a redemption request and produce the resulting quote.
 * `issuedAt` is injected for testability. Points must be a positive multiple
 * of pointsPerUnit (you can only redeem in R3 increments) and at or above the
 * minimum, and cannot exceed the available balance.
 */
export function quoteRedemption(
  requestedPoints: number,
  availableBalance: number,
  issuedAt: Date,
  config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG,
): { ok: true; quote: RedemptionQuote } | { ok: false; error: RedemptionValidationError } {
  if (!Number.isInteger(requestedPoints) || requestedPoints <= 0) {
    return { ok: false, error: 'NON_POSITIVE' };
  }
  if (requestedPoints < config.minRedeemPoints) {
    return { ok: false, error: 'BELOW_MINIMUM' };
  }
  if (requestedPoints % config.pointsPerUnit !== 0) {
    return { ok: false, error: 'NOT_A_MULTIPLE' };
  }
  if (requestedPoints > availableBalance) {
    return { ok: false, error: 'INSUFFICIENT_BALANCE' };
  }

  const expiresAt = new Date(issuedAt);
  expiresAt.setMonth(expiresAt.getMonth() + config.codeValidityMonths);

  return {
    ok: true,
    quote: {
      points: requestedPoints,
      amountZar: pointsToZar(requestedPoints, config),
      currency: config.currency,
      expiresAt,
    },
  };
}

/** Human-readable reason for a validation error. */
export function explainValidationError(error: RedemptionValidationError): string {
  switch (error) {
    case 'NON_POSITIVE':
      return 'Points must be a positive whole number.';
    case 'BELOW_MINIMUM':
      return 'You need at least the minimum number of points to redeem.';
    case 'NOT_A_MULTIPLE':
      return 'Points can only be redeemed in fixed increments.';
    case 'INSUFFICIENT_BALANCE':
      return 'You do not have enough points for this redemption.';
    default:
      return 'Invalid redemption request.';
  }
}

/** Generate a human-friendly, hard-to-guess discount code, e.g. DLX-7F3K9Q2M. */
export function generateDiscountCode(prefix = 'DLX', randomPart?: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let part = randomPart ?? '';
  if (!part) {
    // Caller may inject randomness; default here is deterministic-length only.
    // Prefer passing crypto-based randomness from the service layer.
    for (let i = 0; i < 8; i += 1) {
      part += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return `${prefix}-${part}`;
}
