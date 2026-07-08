import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ShopifyClient } from '@deluxe/shared';
import { LogCategory, WebhookSource, WebhookStatus } from '@deluxe/db';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyService } from '../shopify/shopify.service';
import { ActivityService } from '../activity/activity.service';

/**
 * Inbound webhooks. Shopify order events let us mark a redemption as APPLIED
 * once its discount code is used. All events are persisted for the dashboard.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopify: ShopifyService,
    private readonly activity: ActivityService,
  ) {}

  @Post('shopify')
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

  /** Mark redemptions APPLIED when their discount code appears on a paid order. */
  private async handleShopifyEvent(topic: string, payload: Record<string, unknown>) {
    if (!topic.startsWith('orders/')) return;

    const discountCodes = (payload.discount_codes as Array<{ code?: string }> | undefined) ?? [];
    for (const dc of discountCodes) {
      if (!dc.code) continue;
      const redemption = await this.prisma.redemption.findUnique({
        where: { discountCode: dc.code },
      });
      if (redemption && redemption.status === 'ISSUED') {
        await this.prisma.redemption.update({
          where: { id: redemption.id },
          data: { status: 'APPLIED' },
        });
        await this.activity.info(
          LogCategory.REDEEM,
          `Discount code ${dc.code} applied on a Shopify order`,
          { redemptionId: redemption.id },
        );
      }
    }
  }
}
