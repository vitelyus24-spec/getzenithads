import config from '../config/partners.json' with { type: 'json' };
import { fail, id, now, audit } from './core.js';
export function referralCandidate(org, actor, input) {
  const partner = org.partners[input.partnerId];
  fail(partner, 404, 'PARTNER_NOT_FOUND', 'Partner no encontrado');
  fail(
    typeof input.customerId === 'string' && /^cus_[a-zA-Z0-9]+$/.test(input.customerId),
    400,
    'CUSTOMER_INVALID',
    'Cliente inválido',
  );
  fail(
    partner.userId !== input.referredUserId,
    409,
    'SELF_REFERRAL',
    'Autorreferencia no admitida',
  );
  fail(
    !Object.values(org.referrals).some((r) => r.customerId === input.customerId),
    409,
    'ATTRIBUTION_EXISTS',
    'El cliente ya tiene una atribución candidata',
  );
  const ref = {
    id: id(),
    partnerId: partner.id,
    customerId: input.customerId,
    referredUserId: input.referredUserId || null,
    status: 'pending_policy',
    createdAt: now(),
    policyVersion: config.version,
    windowDays: config.attributionWindowDays,
    activityDefinition: config.activityDefinition,
    payoutsEnabled: false,
  };
  org.referrals[ref.id] = ref;
  audit(org, actor.uid, 'referral.candidate', ref.id);
  return ref;
}
export function partnerActivity(org, actor, partnerId, description) {
  const p = org.partners[partnerId];
  fail(p, 404, 'PARTNER_NOT_FOUND', 'Partner no encontrado');
  fail(
    typeof description === 'string' && description.trim() && description.length <= 1000,
    400,
    'ACTIVITY_INVALID',
    'Actividad inválida',
  );
  p.activity ??= [];
  fail(p.activity.length < 100, 409, 'PILOT_CAPACITY', 'Límite de registros');
  const event = { id: id(), description, at: now(), verified: false };
  p.activity.push(event);
  audit(org, actor.uid, 'partner.activity_recorded', partnerId);
  return event;
}
