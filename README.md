# Deluxe × Zenoti Loyalty Middleware (Monorepo)

Middleware that lets Deluxe customers **redeem their Zenoti loyalty points as
Shopify discount codes** at checkout, plus a dashboard to watch the middleware's
activity, stats, and logs.

> **Loyalty rule:** 100 points = R3.00 (ZAR). Minimum 100 points. One discount
> code per order. Codes are valid for 6 months from date of issue.

## Monorepo layout

```
deluxemonorepo/
├─ apps/
│  ├─ api/            # NestJS middleware — the Zenoti ↔ Shopify engine
│  ├─ web/            # Next.js dashboard — stats & logs
│  └─ shopify-theme/  # Deluxe Shopify theme (drop your downloaded theme here)
├─ packages/
│  ├─ db/             # Prisma schema + client (Postgres)
│  └─ shared/         # Loyalty math, shared types, Zenoti & Shopify API clients
├─ docker-compose.yml # Local Postgres
├─ turbo.json         # Turborepo pipeline
└─ pnpm-workspace.yaml
```

## How redemption works

Points are **reserved** when a code is generated and only **deducted in Zenoti
after payment** — so points are only ever spent on a completed order.

```
Cart widget ──GET /loyalty/balance──▶ shows AVAILABLE points (balance − reserved)

Cart widget ──POST /redemptions──▶ NestJS API
                                     │ 1. resolve user (Shopify↔Zenoti map, by email/phone)
                                     │ 2. read LIVE Zenoti balance
                                     │ 3. available = balance − reserved (open codes)
                                     │ 4. validate (min 100, multiples of 100, ≤ available)
                                     │ 5. create single-use Shopify discount code (= R value)
                                     │ 6. status = ISSUED  (points RESERVED, NOT deducted)
                                     ▼
             { discountCode, amountZar, expiresAt } ──▶ /discount/CODE?redirect=/checkout

Shopper pays ──▶ Shopify `orders/paid` webhook ──▶ NestJS API
                                                     │ atomic claim ISSUED → REDEEMING
                                                     │ deduct points in Zenoti  ◀── now
                                                     │ status = APPLIED + ledger entry
```

**Reservation** prevents a shopper from generating codes worth more points than
they hold: `available = live balance − points locked by open (ISSUED) codes`.
Unused codes past their 6-month expiry are swept back to `EXPIRED`, releasing the
reservation (cron, every 6h).

**Idempotency & safety:** the `orders/paid` handler uses an atomic
`ISSUED → REDEEMING` claim so duplicate webhook deliveries deduct only once. If
the Zenoti deduction fails *after* a paid order, the redemption is marked
`FAILED` and logged as an `ERROR` for manual reconciliation (the discount was
already used, so this must be surfaced).

Redemption statuses: `PENDING → ISSUED → REDEEMING → APPLIED`, plus `EXPIRED`,
`FAILED`, `CANCELLED`.

## Getting started

Prereqs: Node 20+, pnpm 9+, Docker (for local Postgres).

```bash
pnpm install                       # install all workspaces
cp .env.example .env               # fill in Shopify + Zenoti credentials
docker compose up -d               # start Postgres
pnpm db:generate                   # generate Prisma client
pnpm db:migrate                    # create the schema
pnpm db:seed                       # optional demo data

pnpm dev                           # runs API (:4000) + web (:3000) via turbo
```

- Dashboard: http://localhost:3000
- API health: http://localhost:4000/health

## Configuration

All config is via env vars — see [`.env.example`](./.env.example). Nothing secret
is committed. Key groups:

| Group | Vars |
|---|---|
| Database | `DATABASE_URL` |
| Shopify | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_API_TOKEN`, `SHOPIFY_API_VERSION`, `SHOPIFY_WEBHOOK_SECRET` |
| Zenoti | `ZENOTI_MODE`, `ZENOTI_MOCK_DEFAULT_POINTS`, `ZENOTI_API_BASE_URL`, `ZENOTI_API_KEY`, `ZENOTI_CENTER_ID` |
| Loyalty | `LOYALTY_POINTS_PER_UNIT`, `LOYALTY_UNIT_VALUE_ZAR`, `LOYALTY_MIN_REDEEM_POINTS`, `LOYALTY_CODE_VALIDITY_MONTHS`, `LOYALTY_CURRENCY` |

### Zenoti test/sandbox vs. mock

The default is **`ZENOTI_MODE=live`** — point `ZENOTI_API_BASE_URL` at your Zenoti
**test/sandbox tenant** and use its API key + center id to run against real Zenoti
test data (with a live Shopify store).

An optional offline provider (`ZENOTI_MODE=mock`, **off by default**) swaps in an
in-memory `MockZenotiClient` — no keys, no network — if you ever want to test
without any Zenoti tenant:

- Any logged-in Shopify customer is treated as a Zenoti guest with
  `ZENOTI_MOCK_DEFAULT_POINTS` (default **500**) points.
- Balances live in-process and decrease only when points are deducted
  post-payment — exactly like the real flow.
- No network calls, no keys required. **Never use in production.**

Switch to the real integration with `ZENOTI_MODE=live` + `ZENOTI_API_KEY` (point
`ZENOTI_API_BASE_URL` at your Zenoti sandbox tenant to test against real Zenoti).

> Note: resolving a customer still starts with a Shopify customer lookup, so
> end-to-end testing uses your **real Shopify** store with **mock Zenoti**. For a
> customer already linked in the DB, the Shopify lookup is skipped.

## API surface (NestJS)

| Method | Path | Purpose |
|---|---|---|
| GET | `/loyalty/balance?shopifyCustomerId=` | Available points for a customer (cart widget) |
| POST | `/redemptions` | Reserve points → returns a discount code (called by the theme) |
| GET | `/redemptions` | List redemptions (dashboard) |
| GET | `/users` | List linked users |
| GET | `/stats/summary` | KPI snapshot |
| GET | `/stats/redemption-trend?days=14` | Daily redemption series |
| GET | `/activity` | Activity log feed |
| POST | `/sync/run` | Trigger a Zenoti balance sync |
| POST | `/webhooks/shopify` | Shopify `orders/paid` webhook (HMAC-verified) → deducts points in Zenoti |
| GET | `/health` | Liveness + DB check |

## The Zenoti & Shopify clients

Both live in `packages/shared` (`zenoti-client.ts`, `shopify-client.ts`) so the
exact API routes are isolated in one place. Zenoti's loyalty endpoints are gated
per-account — confirm the exact paths against your Zenoti API access and adjust
those two files if needed. The Shopify client uses **Price Rules + Discount
Codes**, which work on every Shopify plan.

## Adding your Shopify theme

The downloaded theme couldn't be copied automatically (this repo was scaffolded in
an isolated cloud environment). See [`apps/shopify-theme/README.md`](./apps/shopify-theme/README.md)
for how to drop it in, plus a ready-made `loyalty-redeem.liquid` widget snippet.

## Testing

```bash
pnpm test          # unit tests (loyalty math is covered in packages/shared)
```
