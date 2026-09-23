import { createHash, randomUUID } from 'node:crypto';
import planConfig from '../config/plans.json' with { type: 'json' };
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fail = (condition, status, code, message) => {
  if (!condition) throw new AppError(status, code, message);
};
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function planFor(key) {
  const p = planConfig.plans[key];
  fail(p, 403, 'PLAN_UNKNOWN', 'Plan no habilitado');
  return { ...(p.inherits ? planFor(p.inherits) : {}), ...p };
}
export const operationCredits = (kind) => planConfig.operations[kind]?.credits;
export function authorize(org, actor, roles = ['owner', 'editor', 'viewer']) {
  fail(org, 404, 'NOT_FOUND', 'Organización no encontrada');
  const uid = typeof actor === 'string' ? actor : actor.uid;
  if (actor?.superadmin === true) return { uid, role: 'superadmin' };
  fail(
    Object.hasOwn(org.members, uid) && roles.includes(org.members[uid].role),
    403,
    'FORBIDDEN',
    'No tienes permiso para esta operación',
  );
  return org.members[uid];
}
export function audit(org, uid, action, entityId, details = {}) {
  org.audit_logs.push({
    id: id(),
    userId: uid,
    organizationId: org.id,
    action,
    entityId,
    at: now(),
    details,
  });
}
export function initialOrg(user, name) {
  const orgId = 'org_' + fingerprint(user.uid).slice(0, 24);
  return {
    schemaVersion: 1,
    id: orgId,
    name,
    createdAt: now(),
    memberUids: [user.uid],
    members: {
      [user.uid]: { uid: user.uid, email: user.email || '', role: 'owner', joinedAt: now() },
    },
    plan: 'pilot',
    creditBalance: planFor('pilot').initialCredits,
    brands: {},
    campaigns: {},
    briefs: {},
    assets: {},
    generation_jobs: {},
    usage: [],
    audit_logs: [],
    metrics: {},
    trends: {},
    sources: {},
    partners: {},
    referrals: {},
    commissions: {},
    subscription: { status: 'pilot', mode: 'test' },
    billingEvents: {},
    rateWindows: {},
    invoices: {},
  };
}
export function limit(org, collection, actor) {
  if (actor?.superadmin) return;
  fail(
    Object.keys(org[collection]).length < planFor(org.plan).limits[collection],
    409,
    'LIMIT_REACHED',
    'Has alcanzado el límite de prueba; no se ha realizado ningún cargo',
  );
}
export function activePlan(org, actor) {
  if (actor?.superadmin)
    return {
      ...planFor('pilot'),
      label: 'Superadministración',
      features: Object.fromEntries(Object.keys(planFor('pilot').features).map((k) => [k, true])),
      limits: Object.fromEntries(
        Object.keys(planFor('pilot').limits).map((k) => [k, Number.MAX_SAFE_INTEGER]),
      ),
    };
  fail(
    ['pilot', 'active', 'trialing'].includes(org.subscription.status),
    402,
    'SUBSCRIPTION_INACTIVE',
    'La suscripción no está activa',
  );
  return planFor(org.plan);
}
export function rateLimit(org, uid) {
  const minute = Math.floor(Date.now() / 60000),
    old = org.rateWindows[uid];
  const window = old?.minute === minute ? old : { minute, count: 0 };
  fail(window.count < 60, 429, 'RATE_LIMIT', 'Demasiadas solicitudes. Espera un minuto');
  window.count++;
  org.rateWindows[uid] = window;
}
export function safeSnapshot(org, actor) {
  const uid = typeof actor === 'string' ? actor : actor.uid;
  const role = authorize(org, actor).role;
  const { billingEvents, rateWindows, invoices, partners, referrals, commissions, ...out } = org;
  return {
    ...out,
    members: ['owner', 'superadmin'].includes(role) ? org.members : { [uid]: org.members[uid] },
    audit_logs: ['owner', 'superadmin'].includes(role) ? org.audit_logs : [],
    subscription: {
      status: org.subscription.status,
      mode: org.subscription.mode,
      periodEnd: org.subscription.periodEnd || null,
    },
    currentRole: role,
    planDefinition: actor?.superadmin ? activePlan(org, actor) : planFor(org.plan),
  };
}

export function committedCost(org, at = Date.now()) {
  const day = new Date(at).toISOString().slice(0, 10);
  return org.usage.reduce(
    (sum, u) =>
      sum +
      (['reserved', 'uncertain', 'cost_pending'].includes(u.status)
        ? u.costEstimatedUSD
        : (u.settledAt || u.createdAt).startsWith(day)
          ? u.costActualUSD || 0
          : 0),
    0,
  );
}
