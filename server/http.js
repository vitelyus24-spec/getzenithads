import { usageSummary } from './observability.js';
import { referralCandidate, partnerActivity } from './partners.js';
import { timingSafeEqual } from 'node:crypto';
import { fail, id, safeSnapshot, authorize, audit, now } from './core.js';
import { entityId } from './schemas.js';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
export async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    fail(size <= 100000, 413, 'BODY_LIMIT', 'Solicitud demasiado grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const json = (res, status, data) => {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const secureEqual = (a, b) =>
  a &&
  b &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function handler(runtime) {
  return async (req, res) => {
    const requestId = id();
    try {
      const url = new URL(req.url, 'http://localhost'),
        parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'api') return false;
      const rt = await (typeof runtime === 'function' ? runtime() : runtime);
      if (url.pathname === '/api/health' && req.method === 'GET') {
        json(res, 200, {
          status: 'ready',
          mode: rt.env.APP_MODE || 'unconfigured',
          demo: rt.env.DEMO_AUTH === 'true',
          ai: rt.service.provider.name,
          stripe: 'test-only',
        });
        return true;
      }
      if (url.pathname === '/api/stripe/webhook' && req.method === 'POST') {
        json(res, 200, await rt.billing.webhook(await body(req), req.headers['stripe-signature']));
        return true;
      }
      const mutation = !['GET', 'HEAD'].includes(req.method);
      if (mutation) {
        fail(
          req.headers.origin === rt.env.APP_ORIGIN,
          403,
          'ORIGIN_REJECTED',
          'Origen no autorizado',
        );
        fail(
          req.headers['content-type']?.startsWith('application/json'),
          415,
          'CONTENT_TYPE',
          'Se requiere JSON',
        );
      }
      const input = mutation ? JSON.parse((await body(req)).toString() || '{}') : {};
      if (url.pathname === '/api/worker/run' && req.method === 'POST') {
        fail(
          rt.env.WORKER_SECRET?.length >= 32 &&
            secureEqual(req.headers.authorization, `Bearer ${rt.env.WORKER_SECRET}`),
          401,
          'WORKER_AUTH',
          'Worker no autorizado',
        );
        const orgId = entityId.parse(input.organizationId),
          jobId = entityId.parse(input.jobId);
        const org = await rt.store.get(orgId);
        fail(org?.generation_jobs[jobId], 404, 'NOT_FOUND', 'Trabajo inexistente');
        const job = org.generation_jobs[jobId];
        fail(
          !job.adminTest,
          403,
          'ADMIN_SESSION_REQUIRED',
          'Trabajo administrativo requiere sesión activa del superadministrador',
        );
        json(res, 200, await rt.service.run(orgId, { uid: job.userId }, jobId));
        return true;
      }
      const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      fail(match, 401, 'AUTH_REQUIRED', 'Inicia sesión');
      const user = await rt.verify(match[1]);
      if (url.pathname === '/api/me' && req.method === 'GET') {
        json(res, 200, {
          user: {
            uid: user.uid,
            email: user.email,
            demo: !!user.demo,
            superadmin: !!user.superadmin,
          },
          organizations: await rt.store.list(user.uid),
        });
        return true;
      }
      if (url.pathname === '/api/admin/organizations' && req.method === 'GET') {
        fail(user.superadmin, 403, 'SUPERADMIN_REQUIRED', 'Solo superadministración');
        json(res, 200, await rt.store.adminList());
        return true;
      }
      if (url.pathname === '/api/bootstrap' && req.method === 'POST') {
        fail(
          Object.keys(input).every((k) => k === 'name') &&
            typeof input.name === 'string' &&
            input.name.trim().length > 0 &&
            input.name.length <= 100,
          400,
          'VALIDATION',
          'Nombre de organización inválido',
        );
        const allow = (rt.env.PILOT_UIDS || '').split(',').map((x) => x.trim());
        fail(
          user.superadmin || user.demo || allow.includes(user.uid),
          403,
          'PILOT_ACCESS',
          'Tu UID debe autorizarse en PILOT_UIDS para crear un workspace de prueba',
        );
        const org = await rt.store.bootstrap(user, input.name.trim());
        json(res, 201, safeSnapshot(org, user));
        return true;
      }
      fail(parts[1] === 'orgs' && parts[2], 404, 'NOT_FOUND', 'Ruta no encontrada');
      const orgId = entityId.parse(parts[2]),
        resource = parts[3],
        recordId = parts[4] ? entityId.parse(parts[4]) : null;
      if (resource === 'observability' && req.method === 'GET') {
        const org = await rt.store.get(orgId);
        authorize(org, user, ['owner']);
        json(res, 200, usageSummary(org));
        return true;
      }
      if (!resource && req.method === 'GET') {
        json(res, 200, await rt.service.view(orgId, user));
        return true;
      }
      if (
        ['brands', 'campaigns', 'briefs', 'sources', 'metrics', 'trends'].includes(resource) &&
        ['POST', 'PATCH'].includes(req.method)
      ) {
        fail(
          (req.method === 'POST' && !recordId) || (req.method === 'PATCH' && recordId),
          400,
          'METHOD',
          'Ruta inválida',
        );
        json(
          res,
          req.method === 'POST' ? 201 : 200,
          await rt.service.save(orgId, user, resource, input, recordId),
        );
        return true;
      }
      if (resource === 'members' && req.method === 'POST') {
        const current = await rt.store.get(orgId);
        authorize(current, user, ['owner']);
        entityId.parse(input.uid);
        fail(rt.verifyMember, 503, 'MEMBER_VERIFICATION', 'Verificación de miembros no disponible');
        await rt.verifyMember(input.uid);
        json(res, 201, await rt.service.member(orgId, user, input));
        return true;
      }
      if (resource === 'assets' && recordId && parts[5] === 'review' && req.method === 'POST') {
        json(res, 200, await rt.service.reviewAsset(orgId, user, recordId, input));
        return true;
      }
      if (resource === 'assets' && req.method === 'POST') {
        json(res, 201, await rt.service.saveAsset(orgId, user, input));
        return true;
      }
      if (resource === 'assets' && recordId && parts[5] === 'download' && req.method === 'GET') {
        const org = await rt.store.get(orgId);
        authorize(org, user);
        const asset = org.assets[recordId];
        fail(
          asset && asset.downloadable !== false,
          404,
          'ASSET_UNAVAILABLE',
          'Activo no disponible',
        );
        const bytes = asset.path
          ? await rt.blobs.get(orgId, recordId)
          : Buffer.from(asset.content || '');
        res.writeHead(200, {
          ...headers,
          'Content-Type': asset.mime || 'text/plain; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': `attachment; filename="zenit-${recordId}.${asset.mime === 'image/png' ? 'png' : asset.mime === 'image/svg+xml' ? 'svg' : 'txt'}"`,
        });
        res.end(bytes);
        return true;
      }
      if (resource === 'jobs' && req.method === 'POST') {
        let result;
        if (!recordId)
          result = await rt.service.enqueue(orgId, user, input, req.headers['idempotency-key']);
        else if (parts[5] === 'run') result = await rt.service.run(orgId, user, recordId);
        else if (parts[5] === 'retry') result = await rt.service.retry(orgId, user, recordId);
        else if (parts[5] === 'recover') result = await rt.service.recover(orgId, user, recordId);
        else fail(false, 404, 'NOT_FOUND', 'Acción no encontrada');
        json(res, 200, result);
        return true;
      }
      if (resource === 'billing' && req.method === 'POST') {
        if (recordId === 'checkout') {
          fail(Object.keys(input).length === 1, 400, 'VALIDATION', 'Solo se admite plan');
          json(res, 200, await rt.billing.checkout(orgId, user, input.plan));
        } else if (recordId === 'topup') {
          fail(Object.keys(input).length === 1, 400, 'VALIDATION', 'Solo se admite packId');
          json(res, 200, await rt.billing.topup(orgId, user, input.packId));
        } else if (recordId === 'portal') json(res, 200, await rt.billing.portal(orgId, user));
        else fail(false, 404, 'NOT_FOUND', 'Acción de pago desconocida');
        return true;
      }
      if (resource === 'partners' && req.method === 'GET') {
        const o = await rt.store.get(orgId);
        authorize(o, user, ['owner']);
        json(res, 200, {
          partners: o.partners,
          referrals: o.referrals,
          commissions: o.commissions,
          paymentsEnabled: false,
        });
        return true;
      }
      if (resource === 'referrals' && req.method === 'POST') {
        json(
          res,
          201,
          await rt.service.mutate(orgId, user, (o) => referralCandidate(o, user, input), ['owner']),
        );
        return true;
      }
      if (resource === 'partners' && recordId && parts[5] === 'activity' && req.method === 'POST') {
        json(
          res,
          201,
          await rt.service.mutate(
            orgId,
            user,
            (o) => partnerActivity(o, user, recordId, input.description),
            ['owner'],
          ),
        );
        return true;
      }
      if (resource === 'partners' && req.method === 'POST') {
        json(
          res,
          201,
          await rt.service.mutate(
            orgId,
            user,
            (org) => {
              fail(
                typeof input.name === 'string' &&
                  input.name.length <= 120 &&
                  Object.keys(input).length === 1,
                400,
                'VALIDATION',
                'Nombre inválido',
              );
              const partnerId = id();
              org.partners[partnerId] = {
                id: partnerId,
                name: input.name,
                userId: user.uid,
                referralCode: id().slice(0, 8),
                status: 'inactive',
                activityPolicy: null,
                attributionWindow: null,
                rateReference: 0.2,
                paymentsEnabled: false,
                createdAt: now(),
              };
              audit(org, user.uid, 'partner.draft_created', partnerId);
              return org.partners[partnerId];
            },
            ['owner'],
          ),
        );
        return true;
      }
      fail(false, 404, 'NOT_FOUND', 'Ruta no encontrada');
    } catch (e) {
      const status = e.name === 'ZodError' || e instanceof SyntaxError ? 400 : e.status || 500;
      json(res, status, {
        error: {
          code: e.code || 'VALIDATION_OR_INTERNAL',
          message:
            status >= 500
              ? 'Servicio no disponible; consulta la configuración del entorno.'
              : e.name === 'ZodError'
                ? 'Revisa los campos: ' +
                  e.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')
                : e.message,
          requestId,
        },
      });
    }
    return true;
  };
}
