import { freshness } from './trends.js';
import creditsConfig from '../config/credits.json' with { type: 'json' };
import { wallet, balance, reserve, settle, quoteCredits } from './credits.js';
import {
  fail,
  id,
  now,
  fingerprint,
  authorize,
  audit,
  limit,
  activePlan,
  operationCredits,
  rateLimit,
  safeSnapshot,
  committedCost,
} from './core.js';
import {
  brandSchema,
  campaignSchema,
  briefSchema,
  jobSchema,
  metricSchema,
  sourceSchema,
  trendSchema,
  memberSchema,
  assetSchema,
} from './schemas.js';
import { brandGuardian, complianceGuardian, metrics, roiIndex } from './guardians.js';
import { promptFor } from './providers.js';
export class Service {
  constructor(store, provider, blobs, env = {}) {
    Object.assign(this, { store, provider, blobs, env });
  }
  async view(orgId, user) {
    return safeSnapshot(await this.store.get(orgId), user);
  }
  async mutate(orgId, user, fn, roles = ['owner', 'editor']) {
    return this.store.transaction(orgId, (org) => {
      authorize(org, user, roles);
      rateLimit(org, user.uid);
      return fn(org);
    });
  }
  async save(orgId, user, kind, input, existingId) {
    const schemas = {
      brands: brandSchema,
      campaigns: campaignSchema,
      briefs: briefSchema,
      sources: sourceSchema,
      trends: trendSchema,
      metrics: metricSchema,
    };
    fail(schemas[kind], 404, 'NOT_FOUND', 'Recurso no encontrado');
    const data = schemas[kind].parse(input);
    return this.mutate(orgId, user, (org) => {
      if (existingId) fail(org[kind][existingId], 404, 'NOT_FOUND', 'Recurso no encontrado');
      else if (['brands', 'campaigns', 'briefs'].includes(kind)) limit(org, kind, user);
      else
        fail(
          Object.keys(org[kind]).length < 300,
          409,
          'PILOT_CAPACITY',
          'Límite de registros del piloto',
        );
      if (kind === 'campaigns')
        fail(
          org.brands[data.brandId],
          404,
          'BRAND_NOT_FOUND',
          'Marca no encontrada en esta organización',
        );
      if (kind === 'briefs' || kind === 'metrics')
        fail(org.campaigns[data.campaignId], 404, 'CAMPAIGN_NOT_FOUND', 'Campaña no encontrada');
      if (kind === 'metrics' || kind === 'trends')
        fail(org.sources[data.sourceId], 404, 'SOURCE_NOT_FOUND', 'Fuente no encontrada');
      if (kind === 'metrics')
        fail(
          activePlan(org, user).features.analytics,
          403,
          'FEATURE_DISABLED',
          'Analítica deshabilitada',
        );
      const key = existingId || id(),
        record = {
          ...data,
          id: key,
          organizationId: org.id,
          createdBy: existingId ? org[kind][key].createdBy : user.uid,
          createdAt: existingId ? org[kind][key].createdAt : now(),
          updatedAt: now(),
        };
      if (kind === 'metrics') {
        const dedupe = fingerprint([data.sourceId, data.campaignId, data.date, data.currency]);
        fail(
          !Object.values(org.metrics).some((m) => m.dedupe === dedupe && m.id !== existingId),
          409,
          'DUPLICATE_METRIC',
          'La fila ya existe; edítala en lugar de sumarla otra vez',
        );
        record.dedupe = dedupe;
        record.calculated = metrics(data);
        record.roiIndex = roiIndex(data);
        record.verification = 'aportado por usuario; no verificado contra plataforma';
      }
      if (kind === 'trends') {
        record.verification = 'evidencia aportada; sin validación independiente';
        record.freshness = freshness(record);
        record.ingestedAt = now();
        record.evidenceHash = fingerprint([record.url, record.observedAt, record.evidence]);
        fail(
          !Object.values(org.trends).some(
            (t) => t.evidenceHash === record.evidenceHash && t.id !== existingId,
          ),
          409,
          'DUPLICATE_TREND',
          'Señal ya registrada',
        );
      }
      org[kind][key] = record;
      audit(org, user.uid, `${kind}.${existingId ? 'updated' : 'created'}`, key);
      return record;
    });
  }
  async member(orgId, user, input) {
    const data = memberSchema.parse(input);
    return this.mutate(
      orgId,
      user,
      (org) => {
        fail(data.uid !== user.uid, 400, 'OWNER_IMMUTABLE', 'No puedes cambiar tu rol');
        fail(
          org.members[data.uid]?.role !== 'owner',
          403,
          'OWNER_IMMUTABLE',
          'Propietario protegido',
        );
        if (!org.members[data.uid]) limit(org, 'members', user);
        org.members[data.uid] = { ...data, joinedAt: now() };
        org.memberUids = Object.keys(org.members);
        audit(org, user.uid, 'member.updated', data.uid, { role: data.role });
        return org.members[data.uid];
      },
      ['owner'],
    );
  }
  async reviewAsset(orgId, user, assetId, input) {
    fail(
      ['approved', 'rejected'].includes(input.decision) &&
        typeof input.note === 'string' &&
        input.note.length <= 2000 &&
        Object.keys(input).length === 2,
      400,
      'REVIEW_INVALID',
      'Decisión de revisión inválida',
    );
    return this.mutate(orgId, user, (org) => {
      const a = org.assets[assetId];
      fail(a, 404, 'NOT_FOUND', 'Activo no encontrado');
      fail(
        !(a.moderation?.flagged && input.decision === 'approved'),
        409,
        'MODERATION_BLOCK',
        'La revisión humana no puede anular este bloqueo de moderación',
      );
      a.humanReview = {
        decision: input.decision,
        note: input.note,
        reviewedBy: user.uid,
        at: now(),
      };
      a.reviewRequired = input.decision !== 'approved';
      audit(org, user.uid, 'asset.reviewed', assetId, { decision: input.decision });
      return a;
    });
  }
  async saveAsset(orgId, user, input) {
    const data = assetSchema.parse(input);
    return this.mutate(orgId, user, (org) => {
      limit(org, 'assets', user);
      const key = id();
      org.assets[key] = {
        ...data,
        id: key,
        organizationId: org.id,
        kind: 'text',
        createdAt: now(),
        createdBy: user.uid,
        demo: false,
      };
      audit(org, user.uid, 'asset.created', key);
      return org.assets[key];
    });
  }
  async enqueue(orgId, user, input, key) {
    fail(
      typeof key === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(key),
      400,
      'IDEMPOTENCY_REQUIRED',
      'Falta clave de idempotencia válida',
    );
    const data = jobSchema.parse(input);
    return this.mutate(orgId, user, (org) => {
      const prior = Object.values(org.generation_jobs).find((j) => j.idempotencyKey === key);
      if (prior) {
        fail(
          prior.requestHash === fingerprint(data),
          409,
          'IDEMPOTENCY_CONFLICT',
          'La clave pertenece a otra solicitud',
        );
        return prior;
      }
      const plan = activePlan(org, user);
      fail(
        plan.features[data.kind],
        403,
        'FEATURE_DISABLED',
        'Modalidad deshabilitada en este piloto',
      );
      fail(
        Object.keys(org.generation_jobs).length < plan.limits.jobs,
        409,
        'LIMIT_REACHED',
        'Límite de trabajos del piloto',
      );
      const brief = org.briefs[data.briefId];
      fail(brief, 404, 'BRIEF_NOT_FOUND', 'Brief no encontrado');
      const campaign = org.campaigns[brief.campaignId],
        brand = org.brands[campaign.brandId];
      let copy = '';
      if (data.kind === 'image') {
        const asset = org.assets[data.copyAssetId];
        fail(
          asset?.kind === 'copy',
          400,
          'COPY_REQUIRED',
          'Selecciona un copy existente de esta organización',
        );
        copy = asset.content;
      }
      limit(org, 'assets', user);
      fail(
        Object.values(org.assets).reduce((n, a) => n + (a.bytes || 0), 0) <
          plan.limits.storageBytes,
        409,
        'STORAGE_LIMIT',
        'Límite de almacenamiento',
      );
      const prompt = promptFor(brand, brief, campaign, copy),
        estimate = this.provider.estimate(data.kind, prompt),
        credits = quoteCredits(creditsConfig, {
          ...data,
          resolution:
            data.kind === 'image' ? (brief.format === '1:1' ? '1024' : '1536') : data.resolution,
          model: this.provider.modelFor?.(data.kind) || this.provider.model,
          estimatedUSD: estimate,
        });
      wallet(org);
      fail(
        user.superadmin || balance(org) >= credits,
        402,
        'INSUFFICIENT_CREDITS',
        'Saldo insuficiente',
      );
      const committed = committedCost(org);
      const max = Number(this.env.ORG_DAILY_MAX_USD || 1);
      fail(
        Number.isFinite(max) && max > 0 && committed + estimate <= max,
        429,
        'COST_LIMIT',
        'Presupuesto diario alcanzado',
      );
      const reservation = reserve(org, credits, user.superadmin);
      const jobId = id(),
        job = {
          id: jobId,
          organizationId: org.id,
          userId: user.uid,
          ...data,
          effectiveResolution:
            data.kind === 'image' ? (brief.format === '1:1' ? '1024' : '1536') : data.resolution,
          status: 'queued',
          createdAt: now(),
          updatedAt: now(),
          attempts: 0,
          idempotencyKey: key,
          requestHash: fingerprint(data),
          provider: this.provider.name,
          model: this.provider.modelFor?.(data.kind) || this.provider.model || 'configured',
          demo: this.provider.demo,
          input: { brand, brief, campaign, copy, prompt },
          reservedCredits: user.superadmin ? 0 : credits,
          quotedCredits: credits,
          creditReservation: reservation,
          adminTest: !!user.superadmin,
          estimatedUSD: estimate,
        };
      org.generation_jobs[jobId] = job;
      org.usage.push({
        id: jobId,
        jobId,
        organizationId: org.id,
        userId: user.uid,
        provider: job.provider,
        model: job.model,
        operation: data.kind,
        createdAt: now(),
        costEstimatedUSD: estimate,
        costActualUSD: null,
        reservedCredits: job.reservedCredits,
        quotedCredits: credits,
        adminTest: !!user.superadmin,
        creditReservation: reservation,
        creditsConsumed: 0,
        status: 'reserved',
      });
      audit(org, user.uid, 'job.reserved', jobId);
      return job;
    });
  }
  async run(orgId, user, jobId) {
    const claim = await this.mutate(orgId, user, (org) => {
      const j = org.generation_jobs[jobId];
      fail(j, 404, 'JOB_NOT_FOUND', 'Trabajo no encontrado');
      if (j.status !== 'queued') return { job: j, claimed: false };
      fail(j.attempts < 3, 409, 'ATTEMPT_LIMIT', 'Reintentos agotados');
      j.status = 'running';
      j.attempts++;
      j.updatedAt = now();
      return { job: structuredClone(j), claimed: true };
    });
    const { job, claimed } = claim;
    if (!claimed) return job;
    let providerStarted = false;
    try {
      fail(
        job.provider === this.provider.name,
        503,
        'PROVIDER_CHANGED',
        'Proveedor cambiado; crea otro trabajo',
      );
      const inputModeration = await this.provider.moderate(job.input.prompt);
      fail(
        !inputModeration.flagged,
        422,
        'MODERATION_BLOCKED',
        'Solicitud bloqueada por moderación',
      );
      providerStarted = true;
      const result = await this.provider.generate({
        kind: job.kind,
        quality: job.quality,
        resolution: job.resolution,
        duration: job.duration,
        ...job.input,
      });
      let moderation = inputModeration,
        guardian = null,
        compliance = null;
      if (result.text) {
        moderation = await this.provider.moderate(result.text);
        guardian = brandGuardian(result.text, job.input.brand);
        compliance = complianceGuardian(result.text, job.input.brand, job.input.campaign);
      }
      if (result.bytes && result.mime === 'image/png')
        moderation = await this.provider.moderate([
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,' + result.bytes.toString('base64') },
          },
        ]);
      let blob = null;
      const assetId = id();
      if (result.bytes && !moderation.flagged)
        blob = await this.blobs.put(orgId, assetId, result.bytes, result.mime);
      return await this.store.transaction(orgId, (org) => {
        const j = org.generation_jobs[jobId];
        fail(j.status === 'running', 409, 'JOB_STATE', 'Estado modificado; conciliación requerida');
        const usage = org.usage.find((u) => u.jobId === jobId);
        const blocked = moderation.flagged;
        const needsReview =
          blocked ||
          guardian?.issues.some((i) => i.severity === 'alta') ||
          compliance?.issues.some((i) => i.severity === 'alta');
        limit(org, 'assets', user);
        const usedBytes = Object.values(org.assets).reduce((n, a) => n + (a.bytes || 0), 0);
        fail(
          usedBytes + (blob?.bytes || 0) <= activePlan(org, user).limits.storageBytes,
          409,
          'STORAGE_LIMIT',
          'Límite de almacenamiento',
        );
        org.assets[assetId] = {
          id: assetId,
          organizationId: orgId,
          jobId,
          kind: job.kind,
          name: job.input.brief.title,
          content: blocked ? '' : result.text || '',
          ...(blob || {}),
          createdAt: now(),
          createdBy: job.userId,
          demo: result.demo,
          moderation,
          guardian,
          compliance,
          downloadable: !blocked,
          reviewRequired: !!needsReview,
        };
        j.status = needsReview ? 'review_required' : 'completed';
        j.assetId = assetId;
        j.updatedAt = now();
        j.input = null;
        usage.status = result.costUSD === null ? 'cost_pending' : 'settled';
        usage.costActualUSD = result.costUSD;
        usage.exceededEstimate = result.costUSD !== null && result.costUSD > j.estimatedUSD;
        usage.providerUsage = result.usage;
        const consumed =
          result.demo || result.costUSD === null || j.estimatedUSD === 0
            ? j.reservedCredits
            : Math.min(
                j.reservedCredits,
                Math.max(1, Math.ceil((j.reservedCredits * result.costUSD) / j.estimatedUSD)),
              );
        usage.creditsConsumed = consumed;
        usage.releasedCredits = j.reservedCredits - consumed;
        usage.buckets = settle(org, j.creditReservation, consumed);
        usage.settledAt = now();
        audit(org, job.userId, 'job.completed', jobId, { status: j.status, demo: result.demo });
        return j;
      });
    } catch (error) {
      return this.store.transaction(orgId, (org) => {
        const j = org.generation_jobs[jobId],
          u = org.usage.find((x) => x.jobId === jobId);
        if (j.status !== 'running') return j;
        const uncertain = providerStarted || error.uncertain;
        j.status = uncertain ? 'uncertain' : 'failed';
        j.error = {
          code: error.code || 'INTERNAL',
          message: uncertain
            ? 'Resultado o coste incierto. Reserva retenida; revisión manual requerida.'
            : error.message,
        };
        j.updatedAt = now();
        u.status = uncertain ? 'uncertain' : 'released';
        if (!uncertain) {
          settle(org, j.creditReservation, 0);
          u.releasedCredits = j.reservedCredits;
        }
        audit(org, job.userId, 'job.failed', jobId, { code: j.error.code, uncertain });
        return j;
      });
    }
  }
  async retry(orgId, user, jobId) {
    return this.mutate(orgId, user, (org) => {
      const j = org.generation_jobs[jobId];
      fail(
        j?.status === 'failed' && j.attempts < 3,
        409,
        'RETRY_NOT_SAFE',
        'Solo se reintentan fallos anteriores a generación; costes inciertos requieren revisión',
      );
      activePlan(org, user);
      const costToday = committedCost(org);
      fail(
        costToday + j.estimatedUSD <= Number(this.env.ORG_DAILY_MAX_USD || 1),
        429,
        'COST_LIMIT',
        'Presupuesto diario alcanzado',
      );
      j.creditReservation = reserve(org, j.quotedCredits, user.superadmin);
      j.reservedCredits = user.superadmin ? 0 : j.quotedCredits;
      j.status = 'queued';
      j.error = null;
      const u = org.usage.find((x) => x.jobId === jobId);
      u.status = 'reserved';
      u.releasedCredits = 0;
      u.reservedCredits = j.reservedCredits;
      u.creditReservation = j.creditReservation;
      u.adminTest = !!user.superadmin;
      j.adminTest = !!user.superadmin;
      audit(org, user.uid, 'job.retry', jobId);
      return j;
    });
  }
  async recover(orgId, user, jobId) {
    return this.mutate(
      orgId,
      user,
      (org) => {
        const j = org.generation_jobs[jobId];
        fail(
          j?.status === 'running' && Date.now() - Date.parse(j.updatedAt) > 120000,
          409,
          'JOB_ACTIVE',
          'El trabajo no ha superado el plazo de recuperación',
        );
        j.status = 'uncertain';
        j.error = {
          code: 'WORKER_INTERRUPTED',
          message: 'Ejecución interrumpida. No reintentar hasta conciliar con proveedor.',
        };
        org.usage.find((u) => u.jobId === jobId).status = 'uncertain';
        audit(org, user.uid, 'job.interrupted', jobId);
        return j;
      },
      ['owner'],
    );
  }
}
