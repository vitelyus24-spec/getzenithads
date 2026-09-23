import { testStripe } from '../server/billing.js';
if (!process.argv.includes('--create-test-catalog'))
  throw new Error('Explicit --create-test-catalog required. TEST only. No charges.');
const stripe = testStripe(process.env),
  map = {};
for (const eur of [19, 49, 149, 299]) {
  const product = await stripe.products.create(
    {
      name: `ZenithAds ${eur} EUR — TEST, NO OFERTA DEFINITIVA`,
      metadata: { stage: 'test', historical: 'true' },
    },
    { idempotencyKey: `zenit-product-historical-${eur}-v1` },
  );
  const price = await stripe.prices.create(
    {
      product: product.id,
      currency: 'eur',
      unit_amount: eur * 100,
      recurring: { interval: 'month' },
    },
    { idempotencyKey: `zenit-price-historical-${eur}-v1` },
  );
  map[`historical${eur}`] = price.id;
}
console.log(JSON.stringify(map, null, 2));
