import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShopifyClient } from '@deluxe/shared';
import { LogCategory, WebhookSource, WebhookStatus } from '@deluxe/db';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyService } from '../shopify/shopify.service';
import { ActivityService } from '../activity/activity.service';
import { RedemptionService } from '../redemption/redemption.service';

/**
 * Inbound webhooks. On a PAID Shopify order, any discount code we issued is
 * consumed: the reserved loyalty points are deducted in Zenoti and the
 * redemption is marked APPLIED. All events are persisted for the dashboard.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopify: ShopifyService,
    private readonly activity: ActivityService,
    private readonly redemption: RedemptionService,
  ) {}

  @Post('shopify')
  @ApiOperation({
    summary: 'Shopify webhook receiver (orders/paid)',
    description:
      'Called by Shopify. HMAC-verified. On orders/paid, deducts the reserved points in Zenoti for any of our discount codes used on the order. Not meant to be called manually.',
  })
  async shopify_(
    @Req() req: Request & { rawBody?: string },
    @Headers('x-shopify-hmac-sha256') hmac?: string,
    @Headers('x-shopify-topic') topic?: string,
  ) {
    const raw = req.rawBody ?? '';
    if (!this.shopify.webhookSecret) {
      throw new BadRequestException('Webhook secret not configured');
    }
    if (!hmac || !ShopifyClient.verifyWebhookHmac(raw, hmac, this.shopify.webhookSecret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const event = await this.prisma.webhookEvent.create({
      data: {
        source: WebhookSource.SHOPIFY,
        topic: topic ?? 'unknown',
        externalId: payload.id ? String(payload.id) : undefined,
        payload: payload as object,
        status: WebhookStatus.RECEIVED,
      },
    });

    try {
      await this.handleShopifyEvent(topic ?? '', payload);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: WebhookStatus.PROCESSED, processedAt: new Date() },
      });
    } catch (err) {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: WebhookStatus.FAILED, error: (err as Error).message },
      });
      await this.activity.error(
        LogCategory.WEBHOOK,
        `Failed to process Shopify webhook ${topic}: ${(err as Error).message}`,
      );
    }

    return { received: true };
  }

  /**
   * On a PAID order, deduct the reserved points in Zenoti for every code we
   * issued that was used. We only act on `orders/paid` so points are spent only
   * once payment has actually completed.
   */
  private async handleShopifyEvent(topic: string, payload: Record<string, unknown>) {
    if (topic !== 'orders/paid') return;

    const discountCodes = (payload.discount_codes as Array<{ code?: string }> | undefined) ?? [];
    const shopifyOrderId = payload.id != null ? String(payload.id) : undefined;
    const shopifyOrderName =
      typeof payload.name === 'string' ? payload.name : undefined;

    for (const dc of discountCodes) {
      if (!dc.code) continue;
      await this.redemption.consumeByDiscountCode({
        code: dc.code,
        shopifyOrderId,
        shopifyOrderName,
      });
    }
  }
}
