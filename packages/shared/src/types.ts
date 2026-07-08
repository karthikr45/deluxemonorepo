import { z } from 'zod';

/** Payload the Shopify theme posts to request a redemption. */
export const RedeemRequestSchema = z.object({
  shopifyCustomerId: z.string().min(1),
  points: z.number().int().positive(),
});
export type RedeemRequest = z.infer<typeof RedeemRequestSchema>;

/** Response returned to the theme after a successful redemption. */
export interface RedeemResponse {
  redemptionId: string;
  discountCode: string;
  points: number;
  amountZar: number;
  currency: string;
  expiresAt: string; // ISO
}

/** Normalized Zenoti guest with loyalty balance. */
export interface ZenotiGuest {
  guestId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  loyaltyPointsBalance: number;
}

/** Dashboard KPI snapshot. */
export interface StatsSummary {
  totalUsers: number;
  totalPointsOutstanding: number;
  redemptionsTotal: number;
  redemptionsLast30d: number;
  pointsRedeemedTotal: number;
  zarIssuedTotal: number;
  failedEventsLast24h: number;
  lastSyncAt: string | null;
}
