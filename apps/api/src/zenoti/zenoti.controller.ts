import { Controller, Get, Query } from '@nestjs/common';
import { ZenotiApiError } from '@deluxe/shared';
import { ZenotiService } from './zenoti.service';

/** Turns any error into a readable diagnostic line (with HTTP status if we have it). */
function describe(err: unknown): string {
  if (err instanceof ZenotiApiError) {
    const body =
      typeof err.body === 'string' ? err.body : err.body ? JSON.stringify(err.body).slice(0, 300) : '';
    return `HTTP ${err.status}: ${err.message}${body ? ` — ${body}` : ''}`;
  }
  return (err as Error)?.message ?? String(err);
}

/**
 * Live Zenoti connectivity check. Run after setting keys in apps/api/.env:
 *   curl "http://localhost:4000/zenoti/ping"
 *   curl "http://localhost:4000/zenoti/ping?email=someone@example.com"
 *
 * Reports, step by step: does auth work (centers), does a guest match, and can
 * we read their loyalty balance — so you see exactly what succeeds/fails.
 */
@Controller('zenoti')
export class ZenotiController {
  constructor(private readonly zenoti: ZenotiService) {}

  @Get('ping')
  async ping(@Query('email') email?: string, @Query('phone') phone?: string) {
    const result: {
      mode: string;
      ok: boolean;
      checks: Record<string, unknown>;
    } = { mode: this.zenoti.mode, ok: false, checks: {} };

    // 1. Auth check — list centers.
    try {
      const centers = await this.zenoti.client.listCenters();
      result.checks.centers = { ok: true, count: centers.length, sample: centers.slice(0, 5) };
      result.ok = true;
    } catch (err) {
      result.checks.centers = { ok: false, error: describe(err) };
    }

    // 2. Optional guest lookup + balance.
    if (email || phone) {
      try {
        const guest = await this.zenoti.client.findGuest({ email, phone });
        if (!guest) {
          result.checks.guest = { ok: false, error: 'No Zenoti guest matched this email/phone' };
        } else {
          result.checks.guest = {
            ok: true,
            guestId: guest.guestId,
            email: guest.email,
            phone: guest.phone,
          };
          try {
            const points = await this.zenoti.client.getLoyaltyBalance(guest.guestId);
            result.checks.balance = { ok: true, points };
          } catch (err) {
            result.checks.balance = { ok: false, error: describe(err) };
          }
        }
      } catch (err) {
        result.checks.guest = { ok: false, error: describe(err) };
      }
    }

    return result;
  }
}
