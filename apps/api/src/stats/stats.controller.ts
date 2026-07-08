import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

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
