import { Module } from '@nestjs/common';
import { RedemptionModule } from '../redemption/redemption.module';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [RedemptionModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
