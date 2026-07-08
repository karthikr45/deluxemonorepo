import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RedemptionService } from './redemption.service';
import { RedemptionController } from './redemption.controller';

@Module({
  imports: [UsersModule],
  providers: [RedemptionService],
  controllers: [RedemptionController],
  exports: [RedemptionService],
})
export class RedemptionModule {}
