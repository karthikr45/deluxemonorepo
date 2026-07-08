import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LedgerSource, LogCategory, SyncStatus } from '@deluxe/db';
import { PrismaService } from '../prisma/prisma.service';
import { ZenotiService } from '../zenoti/zenoti.service';
import { ActivityService } from '../activity/activity.service';

/**
 * Periodically refreshes cached Zenoti loyalty balances for all linked users so
 * the dashboard shows current numbers without hitting Zenoti on every page load.
 * The live balance is always re-read at redemption time regardless.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger('SyncService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly zenoti: ZenotiService,
    private readonly activity: ActivityService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledSync(): Promise<void> {
    await this.runBalanceSync();
  }

  /** Pull balances for every linked user. Returns the SyncRun summary. */
  async runBalanceSync() {
    const run = await this.prisma.syncRun.create({
      data: { kind: 'zenoti_balances', status: SyncStatus.RUNNING },
    });

    let scanned = 0;
    let updated = 0;
    try {
      const users = await this.prisma.user.findMany({
        where: { zenotiGuestId: { not: null } },
        select: { id: true, zenotiGuestId: true, pointsBalance: true },
      });

      for (const user of users) {
        scanned += 1;
        try {
          const balance = await this.zenoti.client.getLoyaltyBalance(user.zenotiGuestId!);
          if (balance !== user.pointsBalance) {
            const delta = balance - user.pointsBalance;
            await this.prisma.$transaction([
              this.prisma.user.update({
                where: { id: user.id },
                data: { pointsBalance: balance, lastSyncedAt: new Date() },
              }),
              this.prisma.pointsLedger.create({
                data: {
                  userId: user.id,
                  delta,
                  balanceAfter: balance,
                  source: LedgerSource.SYNC,
                  reference: `sync:${run.id}`,
                },
              }),
            ]);
            updated += 1;
          } else {
            await this.prisma.user.update({
              where: { id: user.id },
              data: { lastSyncedAt: new Date() },
            });
          }
        } catch (err) {
          await this.activity.warn(
            LogCategory.SYNC,
            `Balance sync failed for user ${user.id}: ${(err as Error).message}`,
            { userId: user.id },
          );
        }
      }

      const finished = await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: SyncStatus.SUCCESS,
          usersScanned: scanned,
          usersUpdated: updated,
          finishedAt: new Date(),
        },
      });
      await this.activity.info(
        LogCategory.SYNC,
        `Balance sync complete: ${updated}/${scanned} users updated`,
      );
      return finished;
    } catch (err) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: SyncStatus.FAILED,
          usersScanned: scanned,
          usersUpdated: updated,
          error: (err as Error).message,
          finishedAt: new Date(),
        },
      });
      await this.activity.error(LogCategory.SYNC, `Balance sync failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
