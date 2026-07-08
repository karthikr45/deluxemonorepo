import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZenotiClient, ZenotiConfig } from '@deluxe/shared';

/** Provides a configured ZenotiClient to the rest of the app. */
@Injectable()
export class ZenotiService {
  private readonly logger = new Logger('ZenotiService');
  readonly client: ZenotiClient;

  constructor(private readonly config: ConfigService) {
    const cfg: ZenotiConfig = {
      baseUrl: this.config.get<string>('ZENOTI_API_BASE_URL', 'https://api.zenoti.com/v1'),
      apiKey: this.config.get<string>('ZENOTI_API_KEY', ''),
      centerId: this.config.get<string>('ZENOTI_CENTER_ID'),
    };
    if (!cfg.apiKey) {
      this.logger.warn('ZENOTI_API_KEY is not set — Zenoti calls will fail until configured.');
    }
    this.client = new ZenotiClient(cfg);
  }
}
