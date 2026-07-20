import { Global, Module } from '@nestjs/common';
import { ZenotiService } from './zenoti.service';
import { ZenotiController } from './zenoti.controller';

@Global()
@Module({
  providers: [ZenotiService],
  controllers: [ZenotiController],
  exports: [ZenotiService],
})
export class ZenotiModule {}
