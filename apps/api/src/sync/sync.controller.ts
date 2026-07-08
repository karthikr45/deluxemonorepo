import { Controller, Get, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly prisma: PrismaService,
  ) {}

  /** Manually trigger a balance sync (dashboard "Sync now" button). */
  @Post('run')
  run() {
    return this.sync.runBalanceSync();
  }

  /** Recent sync runs for the dashboard. */
  @Get('runs')
  runs(@Query('take') take = '20') {
    return this.prisma.syncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(Number(take) || 20, 100),
    });
  }
}
