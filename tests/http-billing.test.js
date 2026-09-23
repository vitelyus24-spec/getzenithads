import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import Stripe from 'stripe';
import { Billing, testStripe } from '../server/billing.js';
import { LocalStore } from '../server/store.js';
import { LocalBlobs } from '../server/blobs.js';
import { Service } from '../server/service.js';
import { MockProvider } from '../server/providers.js';
import { handler } from '../server/http.js';
const user = { uid: 'alice', email: 'alice@example.invalid' };
test('HTTP rejects missing/invalid tokens, foreign origin, role injection; bootstrap E2E', async (t) => {
  const store = await new LocalStore().init(),
    service = new Service(store, new MockProvider(), new LocalBlobs(null));
  let origin;
  const runtime = {
    env: { APP_MODE: 'local', DEMO_AUTH: 'true', PILOT_UIDS: 'alice' },
    store,
    service,
    verify: async (token) => {
      if (token !== 'test-alice') {
        const e = new Error('Invalid');
        e.status = 401;
        throw e;
      }
      return user;
    },
  };
  const server = createServer(handler(runtime));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  origin = `http://127.0.0.1:${server.address().port}`;
  runtime.env.APP_ORIGIN = origin;
  const request = (path, opts = {}) => fetch(origin + path, opts);
  assert.equal((await request('/api/me')).status, 401);
  assert.equal(
    (await request('/api/me', { headers: { Authorization: 'Bearer wrong' } })).status,
    401,
  );
  const opts = {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: 'Bearer test-alice',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Org' }),
  };
  assert.equal(
    (
      await request('/api/bootstrap', {
        ...opts,
        headers: { ...opts.headers, Origin: 'https://evil.invalid' },
      })
    ).status,
    403,
  );
  const response = await request('/api/bootstrap', opts);
  assert.equal(response.status, 201);
  const org = await response.json();
  const view = await request('/api/orgs/' + org.id, {
    headers: { Authorization: 'Bearer test-alice' },
  });
  assert.equal(view.status, 200);
  assert.equal(view.headers.get('cache-control'), 'no-store');
  assert.equal(view.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(
    (
      await request('/api/bootstrap', {
        ...opts,
        body: JSON.stringify({ name: 'Org', plan: 'admin' }),
      })
    ).status,
    400,
  );
});
async function billingFixture() {
  const store = await new LocalStore().init(),
    org = await store.bootstrap(user, 'A');
  await store.transaction(org.id, (o) => {
    o.subscription.customerId = 'cus_test';
  });
  const sub = {
    id: 'sub_test',
    customer: 'cus_test',
    livemode: false,
    status: 'active',
    metadata: { organizationId: org.id },
    items: { data: [{ price: { id: 'price_test' }, current_period_end: 1800000000 }] },
  };
  const billing = new Billing(
    store,
    { STRIPE_PRICE_MAP_JSON: JSON.stringify({ historical49: 'price_test' }) },
    { subscriptions: { retrieve: async () => sub } },
  );
  return { store, org, sub, billing };
}
const evt = (id, type, object) => ({
  id,
  type,
  created: 1790120000,
  livemode: false,
  data: { object },
});
test('Stripe live keys/events rejected', async () => {
  assert.throws(() => testStripe({ STRIPE_SECRET_KEY: 'sk_live_notreal' }));
  const f = await billingFixture();
  await assert.rejects(
    () =>
      f.billing.handle({ ...evt('e', 'invoice.paid', { customer: 'cus_test' }), livemode: true }),
    (e) => e.code === 'LIVE_REJECTED',
  );
});
test('Stripe signature: raw bytes verified; altered body and spoof rejected', async () => {
  const stripe = new Stripe('sk_test_fixture'),
    secret = 'whsec_fixture',
    billing = new Billing(null, { STRIPE_WEBHOOK_SECRET: secret }, stripe);
  billing.handle = async (event) => ({ id: event.id });
  const raw = JSON.stringify(evt('evt_signature', 'noop', {})),
    sig = stripe.webhooks.generateTestHeaderString({ payload: raw, secret });
  assert.deepEqual(await billing.webhook(Buffer.from(raw), sig), { id: 'evt_signature' });
  await assert.rejects(
    () => billing.webhook(Buffer.from(raw + ' '), sig),
    (e) => e.code === 'WEBHOOK_SIGNATURE',
  );
  await assert.rejects(
    () => billing.webhook(Buffer.from(raw), 'bad'),
    (e) => e.code === 'WEBHOOK_SIGNATURE',
  );
});
test('Stripe invoice idempotency grants credits once; current provider state wins', async () => {
  const f = await billingFixture(),
    event = evt('evt_paid', 'invoice.paid', {
      id: 'in_1',
      customer: 'cus_test',
      subscription: 'sub_test',
      paid: true,
      billing_reason: 'subscription_cycle',
      amount_paid: 4900,
      currency: 'eur',
    });
  await f.billing.handle(event);
  await f.billing.handle(event);
  await f.billing.handle({ ...event, id: 'evt_paid_duplicate' });
  let org = await f.store.get(f.org.id);
  assert.equal(org.creditBalance, 200);
  assert.equal(org.plan, 'historical49');
  f.sub.status = 'canceled';
  await f.billing.handle(
    evt('evt_old', 'customer.subscription.updated', {
      id: 'sub_test',
      customer: 'cus_test',
      status: 'active',
    }),
  );
  org = await f.store.get(f.org.id);
  assert.equal(org.subscription.status, 'canceled');
});
test('refund holds access, commissions and does not silently reenable', async () => {
  const f = await billingFixture();
  await f.billing.handle(
    evt('evt_refund', 'charge.refunded', { id: 'ch_1', customer: 'cus_test' }),
  );
  await f.billing.handle(
    evt('evt_update', 'customer.subscription.updated', { id: 'sub_test', customer: 'cus_test' }),
  );
  assert.equal((await f.store.get(f.org.id)).subscription.status, 'review_required');
});
test('foreign subscription metadata never assigns plan', async () => {
  const f = await billingFixture();
  f.sub.metadata.organizationId = 'wrong';
  await assert.rejects(
    () =>
      f.billing.handle(
        evt('evt_bad', 'customer.subscription.updated', { id: 'sub_test', customer: 'cus_test' }),
      ),
    (e) => e.code === 'SUBSCRIPTION_MAPPING',
  );
  assert.equal((await f.store.get(f.org.id)).plan, 'pilot');
});
test('TEST credit packs are fulfilled only on verified payment and exactly once', async () => {
  const f = await billingFixture(),
    pack = { enabled: true, credits: 50, testPriceId: 'price_pack', amountCents: 500 },
    session = {
      id: 'cs_test',
      livemode: false,
      mode: 'payment',
      payment_status: 'paid',
      customer: 'cus_test',
      metadata: { organizationId: f.org.id, packId: 'testpack' },
      amount_total: 500,
      currency: 'eur',
      line_items: { data: [{ price: { id: 'price_pack' }, quantity: 1 }] },
    };
  f.billing.packs = { testpack: pack };
  f.billing.client.checkout = { sessions: { retrieve: async () => session } };
  const event = evt('evt_pack', 'checkout.session.completed', session);
  await f.billing.handle(event);
  await f.billing.handle({ ...event, id: 'evt_pack_2' });
  const org = await f.store.get(f.org.id);
  assert.equal(org.wallet.purchased, 50);
  assert.equal(org.wallet.included, 100);
  session.payment_status = 'unpaid';
  await assert.rejects(
    () => f.billing.handle({ ...event, id: 'evt_pack_3' }),
    (e) => e.code === 'TOPUP_INVALID',
  );
});
