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

## Loyalty redemption widget

To wire the storefront "Ways to Redeem → Redeem" flow to this middleware, add a
snippet that calls the API and renders the returned discount code. A starting
point is provided in `snippets/loyalty-redeem.liquid` (see below). Point it at
your deployed middleware URL and include it in the customer account or cart page.

The widget should:
1. Read the logged-in `customer.id`.
2. Let the shopper choose how many points to redeem (increments of 100 = R3).
3. `POST {MIDDLEWARE_URL}/redemptions` with `{ shopifyCustomerId, points }`.
4. Show the returned `discountCode` and an "Apply Code" button that sets
   `/discount/CODE` (or copies it for manual entry at checkout).

> One code per order. Codes are valid for 6 months from issue.
