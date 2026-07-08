import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IZenotiClient,
  MockZenotiClient,
  ZenotiClient,
  ZenotiConfig,
} from '@deluxe/shared';

/**
 * Provides a Zenoti client to the rest of the app. Selects between the real
 * HTTP client and an in-memory mock test provider based on config:
 *
 *   ZENOTI_MODE=mock            → MockZenotiClient (no network; test points)
 *   ZENOTI_MODE=live (default)  → real ZenotiClient
 *   ZENOTI_MOCK_DEFAULT_POINTS  → starting balance for mock guests (default 500)
 */
@Injectable()
export class ZenotiService {
  private readonly logger = new Logger('ZenotiService');
  readonly client: IZenotiClient;
  readonly mode: 'mock' | 'live';

  constructor(private readonly config: ConfigService) {
    const mode = (this.config.get<string>('ZENOTI_MODE', 'live') ?? 'live').toLowerCase();
    this.mode = mode === 'mock' ? 'mock' : 'live';

    if (this.mode === 'mock') {
      const defaultPoints = Number(this.config.get('ZENOTI_MOCK_DEFAULT_POINTS', 500)) || 500;
      this.client = new MockZenotiClient({ defaultPoints });
      this.logger.warn(
        `ZENOTI_MODE=mock — using the in-memory Zenoti TEST provider (default ${defaultPoints} pts per guest). Do NOT use in production.`,
      );
      return;
    }

    const cfg: ZenotiConfig = {
      baseUrl: this.config.get<string>('ZENOTI_API_BASE_URL', 'https://api.zenoti.com/v1'),
      apiKey: this.config.get<string>('ZENOTI_API_KEY', ''),
      centerId: this.config.get<string>('ZENOTI_CENTER_ID'),
    };
    if (!cfg.apiKey) {
      this.logger.warn(
        'ZENOTI_API_KEY is not set — live Zenoti calls will fail. Set ZENOTI_MODE=mock to test without credentials.',
      );
    }
    this.client = new ZenotiClient(cfg);
  }
}
