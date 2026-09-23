import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fail, initialOrg } from './core.js';
function checkSize(org) {
  fail(
    Buffer.byteLength(JSON.stringify(org)) < 700000,
    409,
    'PILOT_CAPACITY',
    'Capacidad del piloto alcanzada. Hace falta archivar datos antes de continuar',
  );
}
export class LocalStore {
  constructor(path = null) {
    this.path = path;
    this.db = { orgs: {}, users: {} };
    this.queue = Promise.resolve();
  }
  async init() {
    if (this.path)
      try {
        this.db = JSON.parse(await readFile(this.path, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    return this;
  }
  async lock(fn) {
    const run = this.queue.then(async () => {
      const candidate = structuredClone(this.db);
      const result = await fn(candidate);
      if (this.path) {
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(this.path + '.tmp', JSON.stringify(candidate), { mode: 0o600 });
        await rename(this.path + '.tmp', this.path);
      }
      this.db = candidate;
      return structuredClone(result);
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async bootstrap(user, name) {
    return this.lock((db) => {
      const candidate = initialOrg(user, name);
      db.users[user.uid] = { uid: user.uid, email: user.email || '' };
      db.orgs[candidate.id] ??= candidate;
      return db.orgs[candidate.id];
    });
  }
  async list(uid) {
    await this.queue;
    return Object.values(this.db.orgs)
      .filter((o) => o.memberUids.includes(uid))
      .map((o) => ({ id: o.id, name: o.name }));
  }
  async get(orgId) {
    await this.queue;
    return structuredClone(this.db.orgs[orgId] || null);
  }
  async transaction(orgId, fn) {
    return this.lock(async (db) => {
      const org = db.orgs[orgId];
      const result = await fn(org);
      if (org) checkSize(org);
      return result;
    });
  }
  async adminList() {
    await this.queue;
    return Object.values(this.db.orgs).slice(0, 100).map(adminSummary);
  }
  async findCustomer(customer) {
    await this.queue;
    return (
      Object.values(this.db.orgs).find((o) => o.subscription.customerId === customer)?.id || null
    );
  }
}
export class FirestoreStore {
  constructor(db) {
    this.db = db;
    this.orgs = db.collection('zenit_v1_organizations');
  }
  async bootstrap(user, name) {
    const candidate = initialOrg(user, name),
      ref = this.orgs.doc(candidate.id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data();
      tx.create(ref, candidate);
      tx.set(
        this.db.collection('zenit_v1_users').doc(user.uid),
        { uid: user.uid, email: user.email || '', createdAt: candidate.createdAt },
        { merge: true },
      );
      return candidate;
    });
  }
  async list(uid) {
    const s = await this.orgs.where('memberUids', 'array-contains', uid).limit(20).get();
    return s.docs.map((d) => ({ id: d.id, name: d.data().name }));
  }
  async get(orgId) {
    const s = await this.orgs.doc(orgId).get();
    return s.exists ? s.data() : null;
  }
  async transaction(orgId, fn) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.orgs.doc(orgId),
        snap = await tx.get(ref),
        org = snap.exists ? snap.data() : null;
      const result = await fn(org);
      if (org) {
        checkSize(org);
        tx.set(ref, org);
      }
      return result;
    });
  }
  async adminList() {
    const s = await this.orgs.limit(100).get();
    return s.docs.map((d) => adminSummary(d.data()));
  }
  async findCustomer(customer) {
    const s = await this.orgs.where('subscription.customerId', '==', customer).limit(2).get();
    fail(s.size <= 1, 409, 'BILLING_MAPPING', 'Cliente ambiguo');
    return s.docs[0]?.id || null;
  }
}

function adminSummary(o) {
  return {
    id: o.id,
    name: o.name,
    memberCount: o.memberUids.length,
    plan: o.plan,
    status: o.subscription.status,
    credits: o.creditBalance,
    operations: o.usage.length,
    costKnownUSD: o.usage.reduce((n, u) => n + (u.costActualUSD || 0), 0),
    costPendingUSD: o.usage
      .filter((u) => ['reserved', 'uncertain', 'cost_pending'].includes(u.status))
      .reduce((n, u) => n + u.costEstimatedUSD, 0),
  };
}
