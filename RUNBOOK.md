# End-to-End Runbook (ngrok + Theme Editor)

How to run the full Deluxe × Zenoti loyalty flow with the middleware exposed via
**ngrok**, using a **live Shopify** store and a **Zenoti test tenant**, pasting
the theme files into the Shopify **theme editor** by hand.

```
Cart widget ──▶ GET  {ngrok}/loyalty/balance   ──▶ shows available points
Cart widget ──▶ POST {ngrok}/redemptions        ──▶ discount code (points reserved)
   apply code ──▶ /discount/CODE?redirect=/checkout ──▶ pay
Shopify ──orders/paid──▶ {ngrok}/webhooks/shopify ──▶ deduct points in Zenoti
```

---

## A. Start the middleware locally

```bash
pnpm install
cp .env.example .env                 # then edit apps/api/.env (see below)
docker compose up -d                 # Postgres (or use a cloud Postgres URL)
pnpm build                           # build packages/shared etc. (needed by scripts)
pnpm db:generate && pnpm db:migrate
pnpm --filter @deluxe/api dev        # API on http://localhost:4000
```

`apps/api/.env` — the values that matter:
```
DATABASE_URL=postgresql://deluxe:deluxe@localhost:5432/deluxe_loyalty?schema=public

# Live Shopify
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_xxx           # scopes: read_customers, write_price_rules, write_discounts, write/read webhooks
SHOPIFY_API_VERSION=2024-07
SHOPIFY_WEBHOOK_SECRET=xxx                   # see step C

# Zenoti TEST tenant
ZENOTI_MODE=live
ZENOTI_API_BASE_URL=https://<your-zenoti-test-host>/v1
ZENOTI_API_KEY=apikey xxx
ZENOTI_CENTER_ID=xxxx

# Allow the storefront to call the API from the browser.
# Leave blank to allow all origins (simplest for testing), or list your store:
CORS_ORIGINS=
```

Check it's up: `curl http://localhost:4000/health` → `{"status":"ok",...}`

## B. Expose it with ngrok

```bash
ngrok http 4000
```
Copy the HTTPS URL it prints, e.g. `https://abcd-12-34.ngrok-free.app`. Everything
below uses this as `{ngrok}`.

> The widget already sends the `ngrok-skip-browser-warning` header so ngrok's free
> interstitial page doesn't break the JSON responses.

## C. Register the orders/paid webhook

```bash
pnpm --filter @deluxe/api webhook:register https://abcd-12-34.ngrok-free.app
# -> orders/paid webhook CREATED -> https://abcd-12-34.ngrok-free.app/webhooks/shopify
```
Re-run this whenever your ngrok URL changes (it's idempotent). List current hooks
with `pnpm --filter @deluxe/api webhook:list`.

**Webhook secret:** for webhooks created with a **custom app** token (above), the
HMAC is signed with your **custom app's API secret key**
(Admin → Settings → Apps and sales channels → Develop apps → your app → API
credentials → *API secret key*). Put that in `SHOPIFY_WEBHOOK_SECRET` and restart
the API. (If you instead create the webhook under Settings → Notifications, use the
signing secret shown there.)

## D. Paste the theme files into the Theme Editor

Admin → **Online Store → Themes → (your draft theme) → ⋯ → Edit code**. Add/replace
these **4 files** from `apps/shopify-theme/` in the repo:

| Repo file | In the editor |
|---|---|
| `snippets/loyalty-redeem.liquid` | **Snippets → Add a new snippet** named `loyalty-redeem`, paste contents |
| `config/settings_schema.json` | **Config → settings_schema.json** — paste (adds the *Loyalty* setting) |
| `sections/main-cart.liquid` | **Sections → main-cart.liquid** — add the render line (see below) |
| `sections/cart-drawer.liquid` | **Sections → cart-drawer.liquid** — add the render line (see below) |

The two section edits are just one line each, already placed in the repo:

- `main-cart.liquid`, inside `<div class="cart__footer-wrapper …">`:
  ```liquid
  {%- render 'loyalty-redeem' -%}
  ```
- `cart-drawer.liquid`, inside `<div class="drawer__footer-body">`:
  ```liquid
  {%- render 'loyalty-redeem' -%}
  ```

> Prefer to skip `settings_schema.json`? Instead, edit the snippet's
> `data-middleware-url` default and hardcode your `{ngrok}` URL there.

## E. Point the theme at the middleware

Theme editor → **Customize → Theme settings → Loyalty (Deluxe × Zenoti) →
Middleware URL** = your `{ngrok}` URL. Save.

## F. Make sure identities match

The middleware matches the logged-in **Shopify customer's email** to a **Zenoti
guest**. In your **Zenoti test tenant**, create a guest whose **email (or phone)
equals the Shopify customer** you'll log in as, and give them loyalty points.

## G. Test the flow

1. On the storefront (preview or the draft theme), **log in** as that customer.
2. Open the **cart** (page or drawer) → the widget shows available points + Rand.
3. Enter points (multiples of 100) → **Redeem** → a `DLX-…` code appears.
4. **Apply & Checkout** → code is applied → complete payment
   (enable **Bogus Gateway** in Settings → Payments for test orders).
5. On `orders/paid`, the middleware deducts the points in Zenoti and marks the
   redemption **APPLIED**.

## H. Watch it happen

Run the dashboard and tail the logs:
```bash
pnpm --filter @deluxe/web dev        # http://localhost:3000
```
- **Overview** — KPIs (points outstanding, redemptions, value issued)
- **Redemptions** — each code, status (ISSUED → APPLIED), expiry
- **Logs** — every step (reserve, webhook received, Zenoti deduction, errors)

## Troubleshooting

| Symptom | Fix |
|---|---|
| Widget shows "not linked / 0" | No Zenoti guest matches the customer's email/phone — create one in the test tenant |
| CORS error in browser console | Set `CORS_ORIGINS` to include your store domain (or leave blank to allow all) |
| Widget gets HTML not JSON | ngrok warning page — header is already sent; confirm the Middleware URL has no typo and is the HTTPS ngrok URL |
| Webhook 401 in logs | `SHOPIFY_WEBHOOK_SECRET` doesn't match the signing secret for how the webhook was created (see step C) |
| Points not deducted after paying | Check the webhook is registered for the current ngrok URL (`webhook:list`) and the order actually used the `DLX-…` code |
