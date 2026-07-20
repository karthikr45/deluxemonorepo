import { ZenotiGuest } from './types';
import { IZenotiClient, RedeemPointsResult } from './zenoti-client';

export interface MockGuestSeed {
  email?: string;
  phone?: string;
  guestId?: string;
  firstName?: string;
  lastName?: string;
  points: number;
}

export interface MockZenotiOptions {
  /** Points a brand-new guest starts with when first looked up. Default 500. */
  defaultPoints?: number;
  /** Optional explicit guests to preload. */
  seed?: MockGuestSeed[];
}

/**
 * In-memory Zenoti test provider. Implements the same contract as ZenotiClient
 * but never hits the network — use it to exercise the full loyalty flow (balance
 * → reserve → post-payment deduction) without a real Zenoti account.
 *
 * Behaviour:
 *  - findGuest() returns (and lazily creates) a guest for any email/phone with
 *    `defaultPoints`, so any logged-in Shopify customer gets test points.
 *  - Balances live in-process and change only on redeemPoints(), mirroring how
 *    the middleware deducts post-payment.
 *
 * Enable via ZENOTI_MODE=mock. NOT for production.
 */
export class MockZenotiClient implements IZenotiClient {
  private readonly balances = new Map<string, number>(); // guestId -> points
  private readonly guests = new Map<string, ZenotiGuest>(); // guestId -> guest
  private readonly byEmail = new Map<string, string>(); // email -> guestId
  private readonly byPhone = new Map<string, string>(); // phone -> guestId
  private readonly defaultPoints: number;
  private txSeq = 0;

  constructor(opts: MockZenotiOptions = {}) {
    this.defaultPoints = opts.defaultPoints ?? 500;
    for (const s of opts.seed ?? []) {
      this.register({
        email: s.email,
        phone: s.phone,
        guestId: s.guestId,
        firstName: s.firstName,
        lastName: s.lastName,
        loyaltyPointsBalance: s.points,
      });
    }
  }

  private slug(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  private register(guest: Partial<ZenotiGuest> & { email?: string; phone?: string }): ZenotiGuest {
    const guestId =
      guest.guestId ??
      (guest.email
        ? `mock-guest-${this.slug(guest.email)}`
        : guest.phone
          ? `mock-guest-${this.slug(guest.phone)}`
          : `mock-guest-${this.balances.size + 1}`);

    const record: ZenotiGuest = {
      guestId,
      email: guest.email,
      phone: guest.phone,
      firstName: guest.firstName,
      lastName: guest.lastName,
      loyaltyPointsBalance: guest.loyaltyPointsBalance ?? this.defaultPoints,
    };
    this.guests.set(guestId, record);
    this.balances.set(guestId, record.loyaltyPointsBalance);
    if (guest.email) this.byEmail.set(guest.email.toLowerCase(), guestId);
    if (guest.phone) this.byPhone.set(guest.phone, guestId);
    return record;
  }

  async listCenters(): Promise<Array<{ id: string; name?: string; code?: string }>> {
    return [{ id: 'mock-center-1', name: 'Mock Center', code: 'MOCK' }];
  }

  async findGuest(params: { email?: string; phone?: string }): Promise<ZenotiGuest | null> {
    if (!params.email && !params.phone) return null;

    let guestId: string | undefined;
    if (params.email) guestId = this.byEmail.get(params.email.toLowerCase());
    if (!guestId && params.phone) guestId = this.byPhone.get(params.phone);

    if (guestId) return this.snapshot(guestId);
    // Lazily create a test guest so any storefront customer works.
    return this.register({ email: params.email, phone: params.phone });
  }

  async getGuest(guestId: string): Promise<ZenotiGuest> {
    return this.snapshot(guestId) ?? this.register({ guestId });
  }

  async getLoyaltyBalance(guestId: string): Promise<number> {
    if (!this.balances.has(guestId)) this.register({ guestId });
    return this.balances.get(guestId) ?? 0;
  }

  async redeemPoints(params: {
    guestId: string;
    points: number;
    note?: string;
  }): Promise<RedeemPointsResult> {
    const { guestId } = params;
    const current = this.balances.get(guestId) ?? this.defaultPoints;
    const balanceAfter = Math.max(0, current - params.points);
    this.balances.set(guestId, balanceAfter);
    const guest = this.guests.get(guestId);
    if (guest) guest.loyaltyPointsBalance = balanceAfter;
    this.txSeq += 1;
    return { transactionId: `mock-tx-${this.txSeq}`, balanceAfter };
  }

  private snapshot(guestId: string): ZenotiGuest | null {
    const g = this.guests.get(guestId);
    if (!g) return null;
    return { ...g, loyaltyPointsBalance: this.balances.get(guestId) ?? g.loyaltyPointsBalance };
  }
}
