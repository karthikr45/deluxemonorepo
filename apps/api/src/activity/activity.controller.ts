import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LogCategory, LogLevel, Prisma } from '@deluxe/db';
import { PrismaService } from '../prisma/prisma.service';

/** Read API for the dashboard "Logs" view. */
@ApiTags('activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('level') level?: LogLevel,
    @Query('category') category?: LogCategory,
    @Query('take') take = '50',
    @Query('skip') skip = '0',
  ) {
    const where: Prisma.ActivityLogWhereInput = {};
    if (level) where.level = level;
    if (category) where.category = category;

    const takeN = Math.min(Number(take) || 50, 200);
    const skipN = Number(skip) || 0;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: takeN,
        skip: skipN,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { items, total, take: takeN, skip: skipN };
  }
}
