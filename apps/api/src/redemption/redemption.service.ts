import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  explainValidationError,
  generateDiscountCode,
  loadLoyaltyConfig,
  quoteRedemption,
  RedeemResponse,
} from '@deluxe/shared';
import { LedgerSource, LogCategory, Prisma, RedemptionStatus } from '@deluxe/db';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ZenotiService } from '../zenoti/zenoti.service';
import { ShopifyService } from '../shopify/shopify.service';
import { ActivityService } from '../activity/activity.service';
import { RedeemDto } from './dto/redeem.dto';

/**
 * Orchestrates a redemption end-to-end:
 *   1. Resolve the user + Zenoti guest.
 *   2. Read the live Zenoti balance and validate the request (100 pt = R3, min,
 *      multiples, sufficient balance).
 *   3. Deduct the points in Zenoti (source of truth).
 *   4. Create a single-use Shopify discount code worth the Rand value.
 *   5. Persist the Redemption + ledger entry.
 *
 * Ordering note: Zenoti deduction happens before the Shopify code is created so
 * we never issue value the customer hasn't paid for in points. If Shopify code
 * creation then fails, the redemption is marked FAILED and flagged for refund
 * reconciliation (logged as ERROR) rather than silently losing points.
 */
@Injectable()
export class RedemptionService {
  private readonly config = loadLoyaltyConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly zenoti: ZenotiService,
    private readonly shopify: ShopifyService,
    private readonly activity: ActivityService,
  ) {}

  async redeem(dto: RedeemDto): Promise<RedeemResponse> {
    const user = await this.users.resolveByShopifyCustomer(dto.shopifyCustomerId);

    if (!user.zenotiGuestId) {
      throw new BadRequestException(
        'This customer is not linked to a Zenoti loyalty profile yet.',
      );
    }

    // Live balance from Zenoti (do not trust the cached mirror for redemptions).
    const liveBalance = await this.zenoti.client.getLoyaltyBalance(user.zenotiGuestId);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { pointsBalance: liveBalance, lastSyncedAt: new Date() },
    });

    const issuedAt = new Date();
    const result = quoteRedemption(dto.points, liveBalance, issuedAt, this.config);
    if (!result.ok) {
      await this.activity.warn(LogCategory.REDEEM, `Redemption rejected: ${result.error}`, {
        userId: user.id,
        context: { requested: dto.points, balance: liveBalance },
      });
      throw new BadRequestException(explainValidationError(result.error));
    }
    const { quote } = result;

    // Create the pending redemption row first so we have an audit trail even if
    // a downstream call throws.
    const redemption = await this.prisma.redemption.create({
      data: {
        userId: user.id,
        points: quote.points,
        amountZar: new Prisma.Decimal(quote.amountZar),
        currency: quote.currency,
        status: RedemptionStatus.PENDING,
        expiresAt: quote.expiresAt,
      },
    });

    // Step 3 — deduct in Zenoti.
    let zenotiTxId: string;
    let balanceAfter: number;
    try {
      const redeemRes = await this.zenoti.client.redeemPoints({
        guestId: user.zenotiGuestId,
        points: quote.points,
        note: `Deluxe Shopify redemption ${redemption.id}`,
      });
      zenotiTxId = redeemRes.transactionId;
      balanceAfter = redeemRes.balanceAfter;
    } catch (err) {
      await this.markFailed(redemption.id, `Zenoti redeem failed: ${(err as Error).message}`);
      await this.activity.error(LogCategory.ZENOTI, 'Zenoti point deduction failed', {
        userId: user.id,
        redemptionId: redemption.id,
        context: { message: (err as Error).message },
      });
      throw new BadRequestException('Could not deduct points from Zenoti. No code was issued.');
    }

    // Step 4 — create the Shopify discount code.
    const code = generateDiscountCode('DLX', this.randomCodePart());
    try {
      const discount = await this.shopify.client.createFixedAmountDiscount({
        code,
        amountZar: quote.amountZar,
        endsAt: quote.expiresAt,
        title: `Deluxe loyalty ${redemption.id}`,
      });

      const updated = await this.prisma.$transaction(async (tx) => {
        const r = await tx.redemption.update({
          where: { id: redemption.id },
          data: {
            status: RedemptionStatus.ISSUED,
            discountCode: discount.code,
            shopifyPriceRuleId: discount.priceRuleId,
            shopifyDiscountCodeId: discount.discountCodeId,
            zenotiTransactionId: zenotiTxId,
            issuedAt,
          },
        });
        await tx.pointsLedger.create({
          data: {
            userId: user.id,
            delta: -quote.points,
            balanceAfter,
            source: LedgerSource.REDEEM,
            reference: zenotiTxId,
            redemptionId: redemption.id,
          },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { pointsBalance: balanceAfter },
        });
        return r;
      });

      await this.activity.info(LogCategory.REDEEM, `Issued discount code ${discount.code}`, {
        userId: user.id,
        redemptionId: redemption.id,
        context: { points: quote.points, amountZar: quote.amountZar },
      });

      return {
        redemptionId: updated.id,
        discountCode: discount.code,
        points: quote.points,
        amountZar: quote.amountZar,
        currency: quote.currency,
        expiresAt: quote.expiresAt.toISOString(),
      };
    } catch (err) {
      // Points already deducted but code failed — needs reconciliation.
      await this.markFailed(
        redemption.id,
        `Shopify code creation failed after Zenoti deduction: ${(err as Error).message}`,
      );
      await this.activity.error(
        LogCategory.SHOPIFY,
        'Shopify discount creation failed AFTER Zenoti deduction — manual refund required',
        {
          userId: user.id,
          redemptionId: redemption.id,
          context: { zenotiTransactionId: zenotiTxId, points: quote.points },
        },
      );
      throw new BadRequestException(
        'Points were deducted but the discount code could not be created. Support has been notified.',
      );
    }
  }

  async findById(id: string) {
    return this.prisma.redemption.findUnique({
      where: { id },
      include: { user: true },
    });
  }

  async list(status: RedemptionStatus | undefined, take = 50, skip = 0) {
    const where: Prisma.RedemptionWhereInput = status ? { status } : {};
    const takeN = Math.min(take, 200);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.redemption.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: takeN,
        skip,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.redemption.count({ where }),
    ]);
    return { items, total, take: takeN, skip };
  }

  private async markFailed(redemptionId: string, reason: string) {
    await this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { status: RedemptionStatus.FAILED, failureReason: reason },
    });
  }

  /** Crypto-strong 8-char code body from the unambiguous alphabet. */
  private randomCodePart(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i += 1) out += alphabet[randomInt(alphabet.length)];
    return out;
  }
}
