export interface ShopifyConfig {
  storeDomain: string; // e.g. deluxe.myshopify.com
  adminApiToken: string; // shpat_...
  apiVersion: string; // e.g. 2024-07
}

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

export interface CreatedDiscount {
  priceRuleId: string;
  discountCodeId: string;
  code: string;
}

/**
 * Thin Shopify Admin REST client, scoped to what the loyalty middleware needs:
 * create a fixed-amount discount code, and look up a customer.
 *
 * Uses Price Rules + Discount Codes (works on every Shopify plan). A redemption
 * becomes a price rule of type `fixed_amount` with:
 *   - value = -amountZar
 *   - usage_limit = 1            (one code per order)
 *   - once_per_customer = true
 *   - ends_at = issue + 6 months
 */
export class ShopifyClient {
  constructor(
    private readonly config: ShopifyConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private baseUrl(): string {
    return `https://${this.config.storeDomain}/admin/api/${this.config.apiVersion}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl()}${path}`, {
      ...init,
      headers: {
        'X-Shopify-Access-Token': this.config.adminApiToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => undefined);
      }
      throw new ShopifyApiError(
        `Shopify ${init?.method ?? 'GET'} ${path} -> ${res.status}`,
        res.status,
        body,
      );
    }
    return (await res.json()) as T;
  }

  /**
   * Create a single-use fixed-amount discount code worth `amountZar`.
   * Returns the price rule id, discount code id and the code string.
   */
  async createFixedAmountDiscount(params: {
    code: string;
    amountZar: number;
    endsAt: Date;
    title?: string;
  }): Promise<CreatedDiscount> {
    const priceRuleRes = await this.request<{ price_rule: { id: number } }>(`/price_rules.json`, {
      method: 'POST',
      body: JSON.stringify({
        price_rule: {
          title: params.title ?? params.code,
          target_type: 'line_item',
          target_selection: 'all',
          allocation_method: 'across',
          value_type: 'fixed_amount',
          value: `-${params.amountZar.toFixed(2)}`,
          customer_selection: 'all',
          once_per_customer: true,
          usage_limit: 1,
          starts_at: new Date().toISOString(),
          ends_at: params.endsAt.toISOString(),
        },
      }),
    });

    const priceRuleId = String(priceRuleRes.price_rule.id);

    const codeRes = await this.request<{ discount_code: { id: number; code: string } }>(
      `/price_rules/${priceRuleId}/discount_codes.json`,
      {
        method: 'POST',
        body: JSON.stringify({ discount_code: { code: params.code } }),
      },
    );

    return {
      priceRuleId,
      discountCodeId: String(codeRes.discount_code.id),
      code: codeRes.discount_code.code,
    };
  }

  /** Look up a customer by id (numeric or gid). Returns email/phone for matching. */
  async getCustomer(customerId: string): Promise<{
    id: string;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  } | null> {
    const numericId = customerId.replace(/^gid:\/\/shopify\/Customer\//, '');
    const data = await this.request<{
      customer?: {
        id: number;
        email?: string;
        phone?: string;
        first_name?: string;
        last_name?: string;
      };
    }>(`/customers/${encodeURIComponent(numericId)}.json`);
    if (!data.customer) return null;
    return {
      id: String(data.customer.id),
      email: data.customer.email,
      phone: data.customer.phone,
      firstName: data.customer.first_name,
      lastName: data.customer.last_name,
    };
  }

  /**
   * Ensure a webhook subscription exists for `topic` pointing at `address`
   * (idempotent). Used to register orders/paid -> {middleware}/webhooks/shopify.
   */
  async ensureWebhook(
    topic: string,
    address: string,
  ): Promise<{ id: string; created: boolean; address: string }> {
    const existing = await this.request<{
      webhooks: Array<{ id: number; address: string; topic: string }>;
    }>(`/webhooks.json?topic=${encodeURIComponent(topic)}`);

    const match = existing.webhooks?.find((w) => w.address === address && w.topic === topic);
    if (match) return { id: String(match.id), created: false, address };

    const created = await this.request<{ webhook: { id: number; address: string } }>(
      `/webhooks.json`,
      {
        method: 'POST',
        body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
      },
    );
    return { id: String(created.webhook.id), created: true, address };
  }

  /** List all registered webhooks (id, topic, address) — handy for diagnostics. */
  async listWebhooks(): Promise<Array<{ id: string; topic: string; address: string }>> {
    const data = await this.request<{
      webhooks: Array<{ id: number; topic: string; address: string }>;
    }>(`/webhooks.json`);
    return (data.webhooks ?? []).map((w) => ({
      id: String(w.id),
      topic: w.topic,
      address: w.address,
    }));
  }

  /** Verify a Shopify webhook HMAC (base64) against the raw request body. */
  static verifyWebhookHmac(rawBody: string, hmacHeader: string, secret: string): boolean {
    // Lazy require so the client stays usable in edge runtimes that lack crypto.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto') as typeof import('crypto');
    const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    try {
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
    } catch {
      return false;
    }
  }
}
