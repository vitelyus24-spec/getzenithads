import test from 'node:test';
import assert from 'node:assert/strict';
import { freshness } from '../server/trends.js';
import { referralCandidate, partnerActivity } from '../server/partners.js';
import { initialOrg } from '../server/core.js';
test('trend freshness is deterministic and not a popularity prediction', () => {
  const at = Date.parse('2026-09-23T00:00:00Z'),
    r = freshness({ observedAt: '2026-09-22T00:00:00Z' }, at);
  assert.equal(r.ageHours, 24);
  assert.equal(r.state, 'reciente');
  assert.match(r.method, /NO popularidad/);
  assert.equal(freshness({ observedAt: '2026-08-01T00:00:00Z' }, at).score, 0);
});
test('partner attribution remains pending and self-referral is rejected', () => {
  const org = initialOrg({ uid: 'owner' }, 'x');
  org.partners.p = { id: 'p', userId: 'partner' };
  assert.throws(() =>
    referralCandidate(
      org,
      { uid: 'owner' },
      { partnerId: 'p', customerId: 'cus_123', referredUserId: 'partner' },
    ),
  );
  const r = referralCandidate(
    org,
    { uid: 'owner' },
    { partnerId: 'p', customerId: 'cus_123', referredUserId: 'buyer' },
  );
  assert.equal(r.status, 'pending_policy');
  assert.equal(r.payoutsEnabled, false);
  assert.equal(r.windowDays, null);
  assert.throws(() =>
    referralCandidate(
      org,
      { uid: 'owner' },
      { partnerId: 'p', customerId: 'cus_123', referredUserId: 'buyer' },
    ),
  );
  assert.equal(
    partnerActivity(org, { uid: 'owner' }, 'p', 'Demostración realizada').verified,
    false,
  );
});
import { usageSummary } from '../server/observability.js';
test('observability separates known/pending cost and does not fabricate profit', () => {
  const o = initialOrg({ uid: 'u' }, 'x');
  o.usage = [
    {
      userId: 'u',
      provider: 'mock',
      model: 'fixture',
      operation: 'copy',
      status: 'settled',
      costActualUSD: 0.2,
      creditsConsumed: 2,
    },
    {
      userId: 'u',
      provider: 'openai',
      model: 'configured',
      operation: 'image',
      status: 'cost_pending',
      costEstimatedUSD: 1,
      creditsConsumed: 10,
      adminTest: true,
    },
  ];
  const s = usageSummary(o);
  assert.equal(s.total.knownUSD, 0.2);
  assert.equal(s.total.pendingEstimateUSD, 1);
  assert.equal(s.groups.users.u.jobs, 2);
  assert.equal(s.margin.value, null);
});
