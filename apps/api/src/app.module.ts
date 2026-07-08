import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { ActivityModule } from './activity/activity.module';
import { ZenotiModule } from './zenoti/zenoti.module';
import { ShopifyModule } from './shopify/shopify.module';
import { UsersModule } from './users/users.module';
import { RedemptionModule } from './redemption/redemption.module';
import { SyncModule } from './sync/sync.module';
import { StatsModule } from './stats/stats.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    ActivityModule,
    ZenotiModule,
    ShopifyModule,
    UsersModule,
    RedemptionModule,
    SyncModule,
    StatsModule,
    WebhooksModule,
    HealthModule,
  ],
})
export class AppModule {}
