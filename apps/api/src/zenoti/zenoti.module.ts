import { Global, Module } from '@nestjs/common';
import { ZenotiService } from './zenoti.service';

@Global()
@Module({
  providers: [ZenotiService],
  exports: [ZenotiService],
})
export class ZenotiModule {}
