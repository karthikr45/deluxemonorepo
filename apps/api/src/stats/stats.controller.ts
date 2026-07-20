import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('summary')
  summary() {
    return this.stats.summary();
  }

  @Get('redemption-trend')
  trend(@Query('days') days = '14') {
    return this.stats.redemptionTrend(Math.min(Number(days) || 14, 90));
  }
}
