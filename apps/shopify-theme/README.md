# apps/shopify-theme

This folder holds the **Deluxe Shopify theme** (the downloaded theme code).

## How to add your theme

Because the middleware was scaffolded in an isolated cloud environment, the
downloaded theme files could not be copied automatically. Add them locally:

```bash
# from the repo root, on the same branch
cp -R /path/to/your/downloaded/theme/* apps/shopify-theme/
git add apps/shopify-theme
git commit -m "Add Deluxe Shopify theme"
```

A standard Shopify theme has this structure — drop these in alongside this README:

```
apps/shopify-theme/
├─ assets/
├─ config/
├─ layout/
├─ locales/
├─ sections/
├─ snippets/
└─ templates/
```

## Loyalty redemption widget (cart)

`snippets/loyalty-redeem.liquid` is a ready-to-use cart widget. For a logged-in
shopper it:

1. Reads `customer.id`.
2. Calls `GET {MIDDLEWARE_URL}/loyalty/balance?shopifyCustomerId=gid://shopify/Customer/{id}`
   and shows their **available** points and Rand value.
3. Lets them redeem in 100-point (R3) increments →
   `POST {MIDDLEWARE_URL}/redemptions` with `{ shopifyCustomerId, points }`.
4. Renders the returned `discountCode` with **Apply & Checkout**, which sends the
   shopper to `/discount/CODE?redirect=/checkout` so the code is applied
   automatically.

> Points are **reserved** when the code is generated and only **deducted in
> Zenoti after payment** (via the `orders/paid` webhook). One code per order.
> Codes are valid for 6 months from issue.

### 1. Configure the middleware URL

In the Shopify theme editor: **Theme settings → Loyalty (Deluxe × Zenoti) →
Middleware URL**, set it to your deployed API base URL (e.g.
`https://loyalty.deluxe.co.za`). The widget reads `settings.loyalty_middleware_url`.

### 2. Render the widget in the cart

Add it to your cart section/template (e.g. `sections/main-cart-footer.liquid`,
`sections/main-cart-items.liquid`, or the cart drawer snippet):

```liquid
{% render 'loyalty-redeem' %}
```

### 3. Register the Shopify webhook (post-payment deduction)

Create an **Order payment** webhook so points are deducted only after payment:

- Topic: `orders/paid`
- URL: `{MIDDLEWARE_URL}/webhooks/shopify`
- Format: JSON

The webhook is HMAC-verified using `SHOPIFY_WEBHOOK_SECRET`. On `orders/paid`,
the middleware finds the redemption by the used discount code and deducts the
reserved points in Zenoti.
