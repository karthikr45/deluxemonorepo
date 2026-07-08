import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { RedemptionStatus } from '@deluxe/db';
import { RedemptionService } from './redemption.service';
import { RedeemDto } from './dto/redeem.dto';

@Controller('redemptions')
export class RedemptionController {
  constructor(private readonly redemption: RedemptionService) {}

  /** Called by the Shopify theme widget to redeem points for a discount code. */
  @Post()
  redeem(@Body() dto: RedeemDto) {
    return this.redemption.redeem(dto);
  }

  @Get()
  list(
    @Query('status') status?: RedemptionStatus,
    @Query('take') take = '50',
    @Query('skip') skip = '0',
  ) {
    return this.redemption.list(status, Number(take) || 50, Number(skip) || 0);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const r = await this.redemption.findById(id);
    if (!r) throw new NotFoundException(`Redemption ${id} not found`);
    return r;
  }
}
