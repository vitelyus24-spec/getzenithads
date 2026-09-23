import test from 'node:test';
import assert from 'node:assert/strict';
import { principalFromFirebase } from '../server/identity.js';
import { reserve, settle, grant, balance, quoteCredits } from '../server/credits.js';
import { LocalStore } from '../server/store.js';
import { Service } from '../server/service.js';
import { MockProvider } from '../server/providers.js';
import { LocalBlobs } from '../server/blobs.js';
import config from '../config/credits.json' with { type: 'json' };
function authFixture(overrides = {}, recordOverrides = {}) {
  const decoded = {
    uid: 'real-admin-uid',
    email: 'vitelyus24@gmail.com',
    email_verified: true,
    ...overrides,
  };
  return {
    verifyIdToken: async (token, revoke) => {
      assert.equal(revoke, true);
      return decoded;
    },
    getUser: async (uid) => ({
      uid,
      email: decoded.email,
      emailVerified: true,
      disabled: false,
      ...recordOverrides,
    }),
  };
}
test('verified admin email is resolved only using Firebase token plus server account', async () => {
  const p = await principalFromFirebase(authFixture(), 'token');
  assert.equal(p.superadmin, true);
  assert.equal(
    (await principalFromFirebase(authFixture({ email: 'other@example.invalid' }), 'token'))
      .superadmin,
    false,
  );
  assert.equal(
    (await principalFromFirebase(authFixture({}, { emailVerified: false }), 'token')).superadmin,
    false,
  );
  assert.equal(
    (await principalFromFirebase(authFixture({}, { disabled: true }), 'token')).superadmin,
    false,
  );
  assert.equal(
    (await principalFromFirebase(authFixture({}, { email: 'changed@example.invalid' }), 'token'))
      .superadmin,
    false,
  );
});
test('unverified/revoked and UID pinning prevent email-only privilege escalation', async () => {
  await assert.rejects(() =>
    principalFromFirebase(authFixture({ email_verified: false }), 'token'),
  );
  await assert.rejects(() =>
    principalFromFirebase(
      {
        verifyIdToken: async () => {
          throw new Error('revoked');
        },
      },
      'token',
    ),
  );
  assert.equal(
    (await principalFromFirebase(authFixture(), 'token', { SUPERADMIN_UIDS: 'different-uid' }))
      .superadmin,
    false,
  );
  assert.equal(
    (await principalFromFirebase(authFixture(), 'token', { SUPERADMIN_UIDS: 'real-admin-uid' }))
      .superadmin,
    true,
  );
});
test('dual bucket reservations and refunds conserve exact credit amounts', () => {
  const org = { creditBalance: 3 };
  grant(org, 'purchased', 10);
  const r = reserve(org, 8);
  assert.deepEqual(r, { included: 3, purchased: 5, waived: 0 });
  assert.equal(balance(org), 5);
  const result = settle(org, r, 2);
  assert.deepEqual(result, { included: 2, purchased: 0, released: 6 });
  assert.deepEqual(org.wallet, { included: 1, purchased: 10 });
  assert.equal(balance(org), 11);
  assert.throws(() => reserve(org, 12));
  assert.throws(() => settle(org, r, 9));
});
test('superadmin bypasses commercial features and balance; logs cost and no debit', async () => {
  const store = await new LocalStore().init(),
    org = await store.bootstrap({ uid: 'owner' }, 'Org'),
    service = new Service(store, new MockProvider(), new LocalBlobs(null), {
      ORG_DAILY_MAX_USD: '1',
    }),
    admin = { uid: 'admin', superadmin: true };
  await store.transaction(org.id, (o) => {
    o.creditBalance = 0;
    o.plan = 'historical19';
    o.subscription.status = 'canceled';
  });
  const brand = await service.save(org.id, admin, 'brands', {
    name: 'Admin test',
    description: 'x',
    sector: 'x',
    audience: 'x',
    tone: 'x',
    language: 'es',
    productInfo: 'x',
    instructions: '',
  });
  const campaign = await service.save(org.id, admin, 'campaigns', {
    name: 'Test',
    brandId: brand.id,
    objective: 'x',
    platform: 'Meta',
    country: 'ES',
  });
  const brief = await service.save(org.id, admin, 'briefs', {
    campaignId: campaign.id,
    title: 'x',
    objective: 'x',
    offer: '',
    cta: '',
    constraints: '',
    format: '1:1',
  });
  const j = await service.enqueue(
    org.id,
    admin,
    { briefId: brief.id, kind: 'copy' },
    'admin-idempotency-0001',
  );
  await service.run(org.id, admin, j.id);
  const result = await store.get(org.id);
  assert.equal(result.creditBalance, 0);
  assert.equal(result.usage[0].creditsConsumed, 0);
  assert.equal(result.usage[0].adminTest, true);
  assert.ok(result.audit_logs.some((x) => x.userId === 'admin'));
  assert.equal((await service.view(org.id, admin)).currentRole, 'superadmin');
  await assert.rejects(() =>
    service.view(org.id, { uid: 'impostor', email: 'vitelyus24@gmail.com' }),
  );
});
test('expensive operation pricing scales by duration resolution and provider cost', () => {
  const standard = quoteCredits(config, { kind: 'video', duration: 8, resolution: '720p' }),
    premium = quoteCredits(config, {
      kind: 'video',
      duration: 16,
      resolution: '1080p',
      quality: 'high',
    });
  assert.equal(premium, standard * 8);
  assert.ok(quoteCredits(config, { kind: 'copy', estimatedUSD: 10 }) >= 200);
});
test('concurrent reservations never permit a negative balance', async () => {
  const store = await new LocalStore().init(),
    org = await store.bootstrap({ uid: 'x' }, 'x');
  await store.transaction(org.id, (o) => {
    o.creditBalance = 5;
  });
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => store.transaction(org.id, (o) => reserve(o, 1))),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
  assert.equal((await store.get(org.id)).creditBalance, 0);
});
