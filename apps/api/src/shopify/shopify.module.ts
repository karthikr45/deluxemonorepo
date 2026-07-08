import { Global, Module } from '@nestjs/common';
import { ShopifyService } from './shopify.service';

@Global()
@Module({
  providers: [ShopifyService],
  exports: [ShopifyService],
})
export class ShopifyModule {}
