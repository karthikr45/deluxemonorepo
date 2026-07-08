import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopifyClient, ShopifyConfig } from '@deluxe/shared';

/** Provides a configured ShopifyClient to the rest of the app. */
@Injectable()
export class ShopifyService {
  private readonly logger = new Logger('ShopifyService');
  readonly client: ShopifyClient;
  readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const cfg: ShopifyConfig = {
      storeDomain: this.config.get<string>('SHOPIFY_STORE_DOMAIN', ''),
      adminApiToken: this.config.get<string>('SHOPIFY_ADMIN_API_TOKEN', ''),
      apiVersion: this.config.get<string>('SHOPIFY_API_VERSION', '2024-07'),
    };
    this.webhookSecret = this.config.get<string>('SHOPIFY_WEBHOOK_SECRET', '');
    if (!cfg.adminApiToken) {
      this.logger.warn(
        'SHOPIFY_ADMIN_API_TOKEN is not set — Shopify calls will fail until configured.',
      );
    }
    this.client = new ShopifyClient(cfg);
  }
}
