import { Injectable } from '@nestjs/common';
import { LogLevel, RedemptionStatus, WebhookStatus } from '@deluxe/db';
import { StatsSummary } from '@deluxe/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Aggregates the KPI numbers shown on the dashboard overview. */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<StatsSummary> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const issuedStatuses: RedemptionStatus[] = [
      RedemptionStatus.ISSUED,
      RedemptionStatus.APPLIED,
      RedemptionStatus.EXPIRED,
    ];

    const [
      totalUsers,
      pointsAgg,
      redemptionsTotal,
      redemptionsLast30d,
      redeemedAgg,
      failedEvents,
      failedLogs,
      lastSync,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.aggregate({ _sum: { pointsBalance: true } }),
      this.prisma.redemption.count({ where: { status: { in: issuedStatuses } } }),
      this.prisma.redemption.count({
        where: { status: { in: issuedStatuses }, createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.redemption.aggregate({
        where: { status: { in: issuedStatuses } },
        _sum: { points: true, amountZar: true },
      }),
      this.prisma.webhookEvent.count({
        where: { status: WebhookStatus.FAILED, receivedAt: { gte: oneDayAgo } },
      }),
      this.prisma.activityLog.count({
        where: { level: LogLevel.ERROR, createdAt: { gte: oneDayAgo } },
      }),
      this.prisma.syncRun.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      }),
    ]);

    return {
      totalUsers,
      totalPointsOutstanding: pointsAgg._sum.pointsBalance ?? 0,
      redemptionsTotal,
      redemptionsLast30d,
      pointsRedeemedTotal: redeemedAgg._sum.points ?? 0,
      zarIssuedTotal: Number(redeemedAgg._sum.amountZar ?? 0),
      failedEventsLast24h: failedEvents + failedLogs,
      lastSyncAt: lastSync?.finishedAt ? lastSync.finishedAt.toISOString() : null,
    };
  }

  /** Daily redemption counts + Rand issued for the last N days (dashboard chart). */
  async redemptionTrend(days = 14) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.redemption.findMany({
      where: { issuedAt: { gte: since }, status: { not: RedemptionStatus.FAILED } },
      select: { issuedAt: true, points: true, amountZar: true },
      orderBy: { issuedAt: 'asc' },
    });

    const byDay = new Map<string, { count: number; zar: number; points: number }>();
    for (const r of rows) {
      if (!r.issuedAt) continue;
      const key = r.issuedAt.toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { count: 0, zar: 0, points: 0 };
      cur.count += 1;
      cur.zar += Number(r.amountZar);
      cur.points += r.points;
      byDay.set(key, cur);
    }

    return Array.from(byDay.entries()).map(([date, v]) => ({ date, ...v }));
  }
}
