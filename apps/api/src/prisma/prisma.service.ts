import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@deluxe/db';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');

  async onModuleInit(): Promise<void> {
    // Eagerly connect, but don't crash the whole API if the DB is unreachable —
    // Prisma reconnects lazily on the first query, and endpoints that don't need
    // the DB (health, zenoti/ping) must still respond. /health reports db status.
    try {
      await this.$connect();
    } catch (err) {
      this.logger.error(`Database connection failed at startup: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
