import { ZenotiGuest } from './types';

export interface ZenotiConfig {
  baseUrl: string; // ZENOTI_API_BASE_URL
  apiKey: string; // ZENOTI_API_KEY (sent as "Authorization: apikey <key>")
  centerId?: string; // ZENOTI_CENTER_ID
}

export class ZenotiApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ZenotiApiError';
  }
}

export interface RedeemPointsResult {
  transactionId: string;
  balanceAfter: number;
}

/**
 * Contract implemented by both the real {@link ZenotiClient} and the
 * {@link MockZenotiClient} test provider, so the app can swap between them.
 */
export interface IZenotiClient {
  findGuest(params: { email?: string; phone?: string }): Promise<ZenotiGuest | null>;
  getGuest(guestId: string): Promise<ZenotiGuest>;
  getLoyaltyBalance(guestId: string): Promise<number>;
  redeemPoints(params: { guestId: string; points: number; note?: string }): Promise<RedeemPointsResult>;
}

/**
 * Thin Zenoti Admin API client. Endpoints follow Zenoti's public v1 API shape;
 * exact loyalty routes are gated per-account, so the paths below are isolated
 * here for easy adjustment once real API access is confirmed.
 *
 * Docs: https://docs.zenoti.com/  (Loyalty Points / Guests)
 */
export class ZenotiClient implements IZenotiClient {
  constructor(
    private readonly config: ZenotiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const res = await this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: this.config.apiKey,
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
      throw new ZenotiApiError(`Zenoti ${init?.method ?? 'GET'} ${path} -> ${res.status}`, res.status, body);
    }
    return (await res.json()) as T;
  }

  /** Find a guest by email or phone. Returns the first match, if any. */
  async findGuest(params: { email?: string; phone?: string }): Promise<ZenotiGuest | null> {
    const qs = new URLSearchParams();
    if (params.email) qs.set('email', params.email);
    if (params.phone) qs.set('phone', params.phone);
    if (this.config.centerId) qs.set('center_id', this.config.centerId);

    const data = await this.request<{ guests?: RawZenotiGuest[] }>(`/guests/search?${qs.toString()}`);
    const raw = data.guests?.[0];
    return raw ? normalizeGuest(raw) : null;
  }

  /** Read a guest (including loyalty points balance) by Zenoti guest id. */
  async getGuest(guestId: string): Promise<ZenotiGuest> {
    const raw = await this.request<RawZenotiGuest>(`/guests/${encodeURIComponent(guestId)}`);
    return normalizeGuest(raw);
  }

  /** Current loyalty points balance for a guest. */
  async getLoyaltyBalance(guestId: string): Promise<number> {
    const data = await this.request<{ available_points?: number; balance?: number }>(
      `/guests/${encodeURIComponent(guestId)}/loyalty_points/balance`,
    );
    return Number(data.available_points ?? data.balance ?? 0);
  }

  /**
   * Deduct (redeem) loyalty points from a guest. Returns the Zenoti transaction
   * id so the middleware can store it against the Redemption for reconciliation.
   */
  async redeemPoints(params: {
    guestId: string;
    points: number;
    note?: string;
  }): Promise<{ transactionId: string; balanceAfter: number }> {
    const data = await this.request<RawRedeemResponse>(
      `/guests/${encodeURIComponent(params.guestId)}/loyalty_points/redeem`,
      {
        method: 'POST',
        body: JSON.stringify({
          points: params.points,
          center_id: this.config.centerId,
          comments: params.note ?? 'Redeemed for Shopify discount code',
        }),
      },
    );
    return {
      transactionId: data.transaction_id ?? data.id ?? '',
      balanceAfter: Number(data.balance_after ?? data.available_points ?? 0),
    };
  }
}

interface RawZenotiGuest {
  id?: string;
  guest_id?: string;
  personal_info?: {
    email?: string;
    mobile_phone?: { number?: string };
    first_name?: string;
    last_name?: string;
  };
  email?: string;
  loyalty_points?: number;
  available_points?: number;
}

interface RawRedeemResponse {
  id?: string;
  transaction_id?: string;
  balance_after?: number;
  available_points?: number;
}

function normalizeGuest(raw: RawZenotiGuest): ZenotiGuest {
  return {
    guestId: raw.guest_id ?? raw.id ?? '',
    email: raw.personal_info?.email ?? raw.email,
    phone: raw.personal_info?.mobile_phone?.number,
    firstName: raw.personal_info?.first_name,
    lastName: raw.personal_info?.last_name,
    loyaltyPointsBalance: Number(raw.available_points ?? raw.loyalty_points ?? 0),
  };
}
