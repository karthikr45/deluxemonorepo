import 'dotenv/config';
import { ShopifyClient } from '@deluxe/shared';

/**
 * Register the orders/paid webhook that drives the post-payment Zenoti deduction.
 *
 * Usage (from repo root, after `pnpm build`):
 *   pnpm --filter @deluxe/api webhook:register https://<your-ngrok>.ngrok-free.app
 *
 * Reads SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN / SHOPIFY_API_VERSION
 * from apps/api/.env. Idempotent — safe to re-run when your ngrok URL changes.
 */
async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const publicUrl = args.find((a) => !a.startsWith('--')) ?? process.env.PUBLIC_URL;

  const storeDomainEarly = process.env.SHOPIFY_STORE_DOMAIN ?? '';
  const tokenEarly = process.env.SHOPIFY_ADMIN_API_TOKEN ?? '';
  if (listOnly) {
    if (!storeDomainEarly || !tokenEarly) {
      // eslint-disable-next-line no-console
      console.error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set in apps/api/.env');
      process.exit(1);
    }
    const c = new ShopifyClient({
      storeDomain: storeDomainEarly,
      adminApiToken: tokenEarly,
      apiVersion: process.env.SHOPIFY_API_VERSION ?? '2024-07',
    });
    const all = await c.listWebhooks();
    // eslint-disable-next-line no-console
    console.log('Webhooks on the store:');
    all.forEach((w) => console.log(`  ${w.topic.padEnd(16)} ${w.address}`));
    return;
  }

  if (!publicUrl) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: pnpm --filter @deluxe/api webhook:register <public-base-url>\n' +
        '  e.g. pnpm --filter @deluxe/api webhook:register https://abcd-12-34.ngrok-free.app',
    );
    process.exit(1);
  }

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN ?? '';
  const adminApiToken = process.env.SHOPIFY_ADMIN_API_TOKEN ?? '';
  if (!storeDomain || !adminApiToken) {
    // eslint-disable-next-line no-console
    console.error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set in apps/api/.env');
    process.exit(1);
  }

  const client = new ShopifyClient({
    storeDomain,
    adminApiToken,
    apiVersion: process.env.SHOPIFY_API_VERSION ?? '2024-07',
  });

  const address = `${publicUrl.replace(/\/$/, '')}/webhooks/shopify`;
  const res = await client.ensureWebhook('orders/paid', address);

  // eslint-disable-next-line no-console
  console.log(
    `orders/paid webhook ${res.created ? 'CREATED' : 'already exists'} -> ${res.address} (id ${res.id})`,
  );

  const all = await client.listWebhooks();
  // eslint-disable-next-line no-console
  console.log('\nAll webhooks on the store:');
  // eslint-disable-next-line no-console
  all.forEach((w) => console.log(`  ${w.topic.padEnd(16)} ${w.address}`));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
