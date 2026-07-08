import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomInt } from 'crypto';
import {
  explainValidationError,
  generateDiscountCode,
  loadLoyaltyConfig,
  pointsToZar,
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

/** Statuses that lock ("reserve") points against a user's balance. */
const RESERVING_STATUSES: RedemptionStatus[] = [
  RedemptionStatus.ISSUED,
  RedemptionStatus.REDEEMING,
];

export interface LoyaltyAvailability {
  linked: boolean;
  balance: number; // live Zenoti balance
  reserved: number; // points locked by outstanding, unused codes
  available: number; // balance - reserved
  availableValueZar: number;
  currency: string;
  pointsPerUnit: number;
  unitValueZar: number;
  minRedeemPoints: number;
}

export interface ConsumeResult {
  status: 'applied' | 'skipped' | 'failed';
  redemptionId?: string;
  reason?: string;
}

/**
 * Redemption lifecycle:
 *   1. redeem()  — validate against AVAILABLE points (balance − reserved),
 *      create a single-use Shopify discount code, and mark the redemption
 *      ISSUED. Points are RESERVED here, NOT deducted from Zenoti yet.
 *   2. consumeByDiscountCode() — called from the Shopify orders/paid webhook
 *      once the shopper has actually paid using the code. Only now do we
 *      deduct the points in Zenoti and mark the redemption APPLIED.
 *
 * Deferring the Zenoti deduction to post-payment means points are only ever
 * spent on a completed order. Reservation (RESERVING_STATUSES) prevents a
 * shopper from generating codes worth more points than they hold.
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

  /** Points currently reserved by outstanding (unused, unexpired) codes. */
  private async reservedPoints(userId: string, now: Date): Promise<number> {
    const agg = await this.prisma.redemption.aggregate({
      where: {
        userId,
        status: { in: RESERVING_STATUSES },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      _sum: { points: true },
    });
    return agg._sum.points ?? 0;
  }

  /**
   * Live availability for a Shopify customer — what the cart widget shows.
   * Reads the live Zenoti balance and subtracts reserved points.
   */
  async getAvailability(shopifyCustomerId: string): Promise<LoyaltyAvailability> {
    const user = await this.users.resolveByShopifyCustomer(shopifyCustomerId);

    const base = {
      currency: this.config.currency,
      pointsPerUnit: this.config.pointsPerUnit,
      unitValueZar: this.config.unitValueZar,
      minRedeemPoints: this.config.minRedeemPoints,
    };

    if (!user.zenotiGuestId) {
      return { linked: false, balance: 0, reserved: 0, available: 0, availableValueZar: 0, ...base };
    }

    const now = new Date();
    const balance = await this.zenoti.client.getLoyaltyBalance(user.zenotiGuestId);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { pointsBalance: balance, lastSyncedAt: now },
    });

    const reserved = await this.reservedPoints(user.id, now);
    const available = Math.max(0, balance - reserved);

    return {
      linked: true,
      balance,
      reserved,
      available,
      availableValueZar: pointsToZar(available, this.config),
      ...base,
    };
  }

  /**
   * Reserve points and issue a Shopify discount code. Does NOT deduct in Zenoti
   * (that happens post-payment in consumeByDiscountCode).
   */
  async redeem(dto: RedeemDto): Promise<RedeemResponse> {
    const user = await this.users.resolveByShopifyCustomer(dto.shopifyCustomerId);

    if (!user.zenotiGuestId) {
      throw new BadRequestException(
        'This customer is not linked to a Zenoti loyalty profile yet.',
      );
    }

    const now = new Date();
    // Available = live Zenoti balance − points already reserved by open codes.
    const liveBalance = await this.zenoti.client.getLoyaltyBalance(user.zenotiGuestId);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { pointsBalance: liveBalance, lastSyncedAt: now },
    });
    const reserved = await this.reservedPoints(user.id, now);
    const available = Math.max(0, liveBalance - reserved);

    const result = quoteRedemption(dto.points, available, now, this.config);
    if (!result.ok) {
      await this.activity.warn(LogCategory.REDEEM, `Redemption rejected: ${result.error}`, {
        userId: user.id,
        context: { requested: dto.points, balance: liveBalance, reserved, available },
      });
      throw new BadRequestException(explainValidationError(result.error));
    }
    const { quote } = result;

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

    // Create the single-use Shopify discount code worth the Rand value.
    const code = generateDiscountCode('DLX', this.randomCodePart());
    try {
      const discount = await this.shopify.client.createFixedAmountDiscount({
        code,
        amountZar: quote.amountZar,
        endsAt: quote.expiresAt,
        title: `Deluxe loyalty ${redemption.id}`,
      });

      const updated = await this.prisma.redemption.update({
        where: { id: redemption.id },
        // ISSUED = points reserved, code live, awaiting payment.
        data: {
          status: RedemptionStatus.ISSUED,
          discountCode: discount.code,
          shopifyPriceRuleId: discount.priceRuleId,
          shopifyDiscountCodeId: discount.discountCodeId,
          issuedAt: now,
        },
      });

      await this.activity.info(
        LogCategory.REDEEM,
        `Reserved ${quote.points} pts and issued code ${discount.code} (awaiting payment)`,
        {
          userId: user.id,
          redemptionId: redemption.id,
          context: { points: quote.points, amountZar: quote.amountZar },
        },
      );

      return {
        redemptionId: updated.id,
        discountCode: discount.code,
        points: quote.points,
        amountZar: quote.amountZar,
        currency: quote.currency,
        expiresAt: quote.expiresAt.toISOString(),
      };
    } catch (err) {
      await this.markFailed(redemption.id, `Shopify code creation failed: ${(err as Error).message}`);
      await this.activity.error(LogCategory.SHOPIFY, 'Shopify discount creation failed', {
        userId: user.id,
        redemptionId: redemption.id,
        context: { message: (err as Error).message },
      });
      throw new BadRequestException('Could not create the discount code. No points were deducted.');
    }
  }

  /**
   * Post-payment: deduct the reserved points in Zenoti for a code that was used
   * on a paid order. Idempotent and safe against duplicate webhook deliveries
   * via an atomic ISSUED → REDEEMING claim.
   */
  async consumeByDiscountCode(params: {
    code: string;
    shopifyOrderId?: string;
    shopifyOrderName?: string;
  }): Promise<ConsumeResult> {
    const redemption = await this.prisma.redemption.findUnique({
      where: { discountCode: params.code },
      include: { user: true },
    });
    if (!redemption) {
      // Code wasn't issued by us (e.g. a manual/marketing discount) — ignore.
      return { status: 'skipped', reason: 'unknown-code' };
    }
    if (!redemption.user.zenotiGuestId) {
      await this.markFailed(redemption.id, 'User has no linked Zenoti guest at consume time');
      return { status: 'failed', redemptionId: redemption.id, reason: 'no-zenoti-guest' };
    }

    // Atomic claim: only the first delivery flips ISSUED → REDEEMING.
    const claim = await this.prisma.redemption.updateMany({
      where: { id: redemption.id, status: RedemptionStatus.ISSUED },
      data: { status: RedemptionStatus.REDEEMING },
    });
    if (claim.count === 0) {
      // Already REDEEMING/APPLIED/other — a prior delivery handled it.
      return { status: 'skipped', redemptionId: redemption.id, reason: 'already-processed' };
    }

    try {
      const res = await this.zenoti.client.redeemPoints({
        guestId: redemption.user.zenotiGuestId,
        points: redemption.points,
        note: `Deluxe Shopify order ${params.shopifyOrderName ?? params.shopifyOrderId ?? ''} (${redemption.id})`,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.redemption.update({
          where: { id: redemption.id },
          data: {
            status: RedemptionStatus.APPLIED,
            zenotiTransactionId: res.transactionId,
            shopifyOrderId: params.shopifyOrderId,
            shopifyOrderName: params.shopifyOrderName,
            appliedAt: new Date(),
          },
        });
        await tx.pointsLedger.create({
          data: {
            userId: redemption.userId,
            delta: -redemption.points,
            balanceAfter: res.balanceAfter,
            source: LedgerSource.REDEEM,
            reference: res.transactionId,
            redemptionId: redemption.id,
          },
        });
        await tx.user.update({
          where: { id: redemption.userId },
          data: { pointsBalance: res.balanceAfter },
        });
      });

      await this.activity.info(
        LogCategory.REDEEM,
        `Deducted ${redemption.points} pts in Zenoti for paid order ${params.shopifyOrderName ?? params.shopifyOrderId ?? ''}`,
        { userId: redemption.userId, redemptionId: redemption.id },
      );

      return { status: 'applied', redemptionId: redemption.id };
    } catch (err) {
      // Discount was already used but Zenoti deduction failed — flag loudly.
      await this.markFailed(
        redemption.id,
        `Zenoti deduction failed post-payment: ${(err as Error).message}`,
      );
      await this.activity.error(
        LogCategory.ZENOTI,
        'Zenoti deduction FAILED after a paid order — points not deducted, manual reconciliation required',
        {
          userId: redemption.userId,
          redemptionId: redemption.id,
          context: {
            code: params.code,
            shopifyOrderId: params.shopifyOrderId,
            points: redemption.points,
            message: (err as Error).message,
          },
        },
      );
      return { status: 'failed', redemptionId: redemption.id, reason: 'zenoti-deduction-failed' };
    }
  }

  /** Release reservations whose codes have expired unused (ISSUED past expiry). */
  @Cron(CronExpression.EVERY_6_HOURS)
  async expireStaleReservations(): Promise<number> {
    const res = await this.prisma.redemption.updateMany({
      where: { status: RedemptionStatus.ISSUED, expiresAt: { lt: new Date() } },
      data: { status: RedemptionStatus.EXPIRED },
    });
    if (res.count > 0) {
      await this.activity.info(
        LogCategory.SYSTEM,
        `Expired ${res.count} unused redemption code(s); reservations released`,
      );
    }
    return res.count;
  }

  async findById(id: string) {
    return this.prisma.redemption.findUnique({ where: { id }, include: { user: true } });
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
