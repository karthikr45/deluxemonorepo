# API Map — Middleware, Shopify & Zenoti

Three layers: **(A)** endpoints the middleware *exposes*, **(B)** Shopify APIs it *calls*,
**(C)** Zenoti APIs it *calls* — and how they connect.

> **Interactive docs:** run the API and open **`http://localhost:4000/docs`** (Swagger UI).
> Raw OpenAPI spec: **`/docs-json`**.

Config: `100 points = R3 (ZAR)`, min 100, multiples of 100, codes valid 6 months,
one code per order.

---

## A. Middleware endpoints (NestJS — what we expose)

Base URL = your API (e.g. `https://<ngrok>` or `http://localhost:4000`).

| Method & Path | Purpose | Caller | Downstream call |
|---|---|---|---|
| `GET /health` | Liveness + DB status | monitoring | — |
| `GET /loyalty/balance?shopifyCustomerId=` | Available points + Rand value (cart) | Theme widget | Shopify `getCustomer` + Zenoti `findGuest`, `getLoyaltyBalance` |
| `POST /redemptions` | Reserve points → issue discount code | Theme widget | Zenoti `getLoyaltyBalance` + Shopify create discount |
| `GET /redemptions` · `GET /redemptions/{id}` | List / view redemptions | Dashboard | DB |
| `POST /webhooks/shopify` | `orders/paid` → deduct points | **Shopify** | Zenoti `redeemPoints` |
| `GET /users` · `GET /users/{id}` | Linked users | Dashboard | DB |
| `GET /stats/summary` · `GET /stats/redemption-trend` | KPIs / chart | Dashboard | DB |
| `GET /activity` | Activity log feed | Dashboard | DB |
| `POST /sync/run` · `GET /sync/runs` | Trigger / view balance sync | Dashboard | Zenoti `getLoyaltyBalance` (bulk) |
| `GET /zenoti/ping[?email=&phone=]` | Live connectivity diagnostic | You (setup) | Zenoti `listCenters`, `findGuest`, `getLoyaltyBalance` |

---

## B. Shopify APIs we call
REST Admin API `2024-07`, base `https://{store}.myshopify.com/admin/api/2024-07`.
Source: `packages/shared/src/shopify-client.ts`.

| Shopify API | Method → Endpoint | Used for | Called from |
|---|---|---|---|
| Get customer | `GET /customers/{id}.json` | Read email/phone to match a Zenoti guest | `users.service` |
| Create price rule | `POST /price_rules.json` | Fixed-amount (−R) rule, usage_limit 1, once_per_customer, ends_at +6mo | `redemption.service` |
| Create discount code | `POST /price_rules/{id}/discount_codes.json` | Attach the `DLX-…` code | `redemption.service` |
| List webhooks | `GET /webhooks.json[?topic=]` | Idempotency check before registering | `webhook:register` script |
| Create webhook | `POST /webhooks.json` | Register `orders/paid` → `/webhooks/shopify` | `webhook:register` script |
| Webhook **received** | `orders/paid` (inbound) | Shopify calls us; HMAC-SHA256 verified | `webhooks.controller` |

Scopes required on the Admin token: `read_customers`, `write_price_rules`,
`write_discounts`, `read_orders`/`write_orders` (webhook), `read/write webhooks`.

---

## C. Zenoti APIs we call
Base `https://api.zenoti.com/v1`, header `Authorization: apikey <key>`.
Source: `packages/shared/src/zenoti-client.ts`.

| Zenoti API | Method → Endpoint | Used for | Called from |
|---|---|---|---|
| List centers | `GET /centers` | Auth check + center id | `zenoti/ping`, setup |
| Search guest | `GET /guests/search?email=&phone=` | Find the guest for a Shopify customer | `users.service` |
| Get guest | `GET /guests/{id}` | Read one guest | helper |
| Loyalty balance | `GET /guests/{id}/loyalty_points/balance` | Read available points | `loyalty/balance`, `redemptions`, `sync` |
| Redeem points | `POST /guests/{id}/loyalty_points/redeem` | **Deduct points** post-payment | `consumeByDiscountCode` (webhook) |

> ⚠️ The Zenoti loyalty routes (`/loyalty_points/*`) and `/guests/search` follow
> Zenoti's documented shape but must be confirmed against your tenant. They are
> isolated in `zenoti-client.ts` for easy adjustment.

---

## How it connects (end to end)

```
1. Cart loads
   Theme → GET /loyalty/balance
         → Shopify GET /customers/{id}.json        (email/phone)
         → Zenoti  GET /guests/search              (find guest)
         → Zenoti  GET .../loyalty_points/balance
         ⇒ shows "Available Points / Amount R"

2. Get Discount Code
   Theme → POST /redemptions
         → Zenoti  GET .../loyalty_points/balance  (re-check live)
         → Shopify POST /price_rules.json + /discount_codes.json
         ⇒ returns DLX-code   (points RESERVED, not deducted)

3. Pay
   Shopify → POST /webhooks/shopify   (orders/paid, HMAC-verified)
           → Zenoti POST .../loyalty_points/redeem   ⇐ POINTS DEDUCTED (once)
           ⇒ redemption APPLIED, ledger written

Background: POST /sync/run → Zenoti balances for all linked users
Setup:      GET /zenoti/ping → Zenoti centers + guest + balance (verify keys)
```

Reads happen at cart time; the **Zenoti deduction happens exactly once,
post-payment, via the `orders/paid` webhook**.
