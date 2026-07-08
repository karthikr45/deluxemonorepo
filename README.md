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

```
Shopify theme widget ──POST /redemptions──▶ NestJS API
                                              │ 1. resolve user (Shopify↔Zenoti map, by email/phone)
                                              │ 2. read LIVE Zenoti points balance
                                              │ 3. validate (min 100, multiples of 100, ≤ balance)
                                              │ 4. deduct points in Zenoti  ◀── source of truth
                                              │ 5. create single-use Shopify discount code (= R value)
                                              │ 6. persist Redemption + ledger entry
                                              ▼
                            { discountCode, amountZar, expiresAt } ──▶ shopper applies at checkout
```

Points are deducted in Zenoti **before** the Shopify code is created, so value is
never issued without the points being spent. If Shopify code creation then fails,
the redemption is marked `FAILED` and logged as an `ERROR` for reconciliation.

Once a Shopify **orders/** webhook shows the code was used, the redemption flips
to `APPLIED`.

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
| Zenoti | `ZENOTI_API_BASE_URL`, `ZENOTI_API_KEY`, `ZENOTI_CENTER_ID` |
| Loyalty | `LOYALTY_POINTS_PER_UNIT`, `LOYALTY_UNIT_VALUE_ZAR`, `LOYALTY_MIN_REDEEM_POINTS`, `LOYALTY_CODE_VALIDITY_MONTHS`, `LOYALTY_CURRENCY` |

## API surface (NestJS)

| Method | Path | Purpose |
|---|---|---|
| POST | `/redemptions` | Redeem points → returns a discount code (called by the theme) |
| GET | `/redemptions` | List redemptions (dashboard) |
| GET | `/users` | List linked users |
| GET | `/stats/summary` | KPI snapshot |
| GET | `/stats/redemption-trend?days=14` | Daily redemption series |
| GET | `/activity` | Activity log feed |
| POST | `/sync/run` | Trigger a Zenoti balance sync |
| POST | `/webhooks/shopify` | Shopify order webhooks (HMAC-verified) |
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
