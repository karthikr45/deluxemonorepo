import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RedemptionStatus } from '@deluxe/db';
import { RedemptionService } from './redemption.service';
import { RedeemDto } from './dto/redeem.dto';

@ApiTags('redemptions')
@Controller('redemptions')
export class RedemptionController {
  constructor(private readonly redemption: RedemptionService) {}

  @Post()
  @ApiOperation({
    summary: 'Redeem points → issue a discount code',
    description:
      'Reserves the points (status ISSUED) and creates a single-use Shopify discount code worth the Rand value. Points are NOT deducted in Zenoti here — that happens post-payment via the orders/paid webhook.',
  })
  redeem(@Body() dto: RedeemDto) {
    return this.redemption.redeem(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List redemptions (dashboard)' })
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
