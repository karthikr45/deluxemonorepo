import { describe, expect, it } from 'vitest';
import { MockZenotiClient } from './mock-zenoti-client';

describe('MockZenotiClient', () => {
  it('lazily creates a guest with the default points for any email', async () => {
    const z = new MockZenotiClient({ defaultPoints: 500 });
    const guest = await z.findGuest({ email: 'Test@Deluxe.co.za' });
    expect(guest).not.toBeNull();
    expect(guest!.loyaltyPointsBalance).toBe(500);
    // Same email (case-insensitive) resolves to the same guest.
    const again = await z.findGuest({ email: 'test@deluxe.co.za' });
    expect(again!.guestId).toBe(guest!.guestId);
  });

  it('honours seeded guests', async () => {
    const z = new MockZenotiClient({
      seed: [{ email: 'alice@example.com', points: 450, guestId: 'zen-alice' }],
    });
    const g = await z.findGuest({ email: 'alice@example.com' });
    expect(g!.guestId).toBe('zen-alice');
    expect(await z.getLoyaltyBalance('zen-alice')).toBe(450);
  });

  it('deducts points on redeem and reflects the new balance', async () => {
    const z = new MockZenotiClient({ defaultPoints: 500 });
    const g = await z.findGuest({ email: 'bob@example.com' });
    const res = await z.redeemPoints({ guestId: g!.guestId, points: 300 });
    expect(res.balanceAfter).toBe(200);
    expect(res.transactionId).toMatch(/^mock-tx-/);
    expect(await z.getLoyaltyBalance(g!.guestId)).toBe(200);
  });

  it('never goes negative', async () => {
    const z = new MockZenotiClient({ defaultPoints: 100 });
    const g = await z.findGuest({ email: 'c@example.com' });
    const res = await z.redeemPoints({ guestId: g!.guestId, points: 500 });
    expect(res.balanceAfter).toBe(0);
  });

  it('returns null when no email or phone is given', async () => {
    const z = new MockZenotiClient();
    expect(await z.findGuest({})).toBeNull();
  });
});
