import { Injectable, Logger } from '@nestjs/common';
import { LogCategory, LogLevel, Prisma } from '@deluxe/db';
import { PrismaService } from '../prisma/prisma.service';

interface LogInput {
  level?: LogLevel;
  category: LogCategory;
  message: string;
  context?: Prisma.InputJsonValue;
  userId?: string;
  redemptionId?: string;
}

/**
 * Writes structured entries to the ActivityLog table (the dashboard's Logs feed)
 * and mirrors them to the Nest logger. Persistence failures never throw into
 * business logic — logging must not break a redemption.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger('Activity');

  constructor(private readonly prisma: PrismaService) {}

  async log(input: LogInput): Promise<void> {
    const level = input.level ?? LogLevel.INFO;
    const line = `[${input.category}] ${input.message}`;
    if (level === LogLevel.ERROR) this.logger.error(line);
    else if (level === LogLevel.WARN) this.logger.warn(line);
    else this.logger.log(line);

    try {
      await this.prisma.activityLog.create({
        data: {
          level,
          category: input.category,
          message: input.message,
          context: input.context,
          userId: input.userId,
          redemptionId: input.redemptionId,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to persist activity log: ${(err as Error).message}`);
    }
  }

  info(category: LogCategory, message: string, extra?: Omit<LogInput, 'level' | 'category' | 'message'>) {
    return this.log({ level: LogLevel.INFO, category, message, ...extra });
  }

  warn(category: LogCategory, message: string, extra?: Omit<LogInput, 'level' | 'category' | 'message'>) {
    return this.log({ level: LogLevel.WARN, category, message, ...extra });
  }

  error(category: LogCategory, message: string, extra?: Omit<LogInput, 'level' | 'category' | 'message'>) {
    return this.log({ level: LogLevel.ERROR, category, message, ...extra });
  }
}
