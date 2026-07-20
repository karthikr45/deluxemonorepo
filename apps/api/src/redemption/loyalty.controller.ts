import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RedemptionService } from './redemption.service';

/**
 * Storefront-facing loyalty read API. The cart widget calls this to show the
 * logged-in shopper their available points before redeeming.
 *
 * Uses a query param (not a path param) because Shopify customer ids are gids
 * like `gid://shopify/Customer/123` which contain slashes.
 */
@ApiTags('loyalty')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly redemption: RedemptionService) {}

  @Get('balance')
  @ApiOperation({
    summary: 'Available loyalty points for a Shopify customer',
    description:
      'Called by the cart widget. Returns available (= live Zenoti balance − reserved), the Rand value, and the conversion config (100 points = R3).',
  })
  @ApiQuery({
    name: 'shopifyCustomerId',
    required: true,
    example: 'gid://shopify/Customer/1234567890',
  })
  balance(@Query('shopifyCustomerId') shopifyCustomerId?: string) {
    if (!shopifyCustomerId) {
      throw new BadRequestException('shopifyCustomerId is required');
    }
    return this.redemption.getAvailability(shopifyCustomerId);
  }
}
