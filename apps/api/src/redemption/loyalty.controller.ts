import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { RedemptionService } from './redemption.service';

/**
 * Storefront-facing loyalty read API. The cart widget calls this to show the
 * logged-in shopper their available points before redeeming.
 *
 * Uses a query param (not a path param) because Shopify customer ids are gids
 * like `gid://shopify/Customer/123` which contain slashes.
 */
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly redemption: RedemptionService) {}

  @Get('balance')
  balance(@Query('shopifyCustomerId') shopifyCustomerId?: string) {
    if (!shopifyCustomerId) {
      throw new BadRequestException('shopifyCustomerId is required');
    }
    return this.redemption.getAvailability(shopifyCustomerId);
  }
}
