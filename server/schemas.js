import { z } from 'zod';
const text = (max = 2000) => z.string().trim().max(max);
const required = (max = 120) => text(max).min(1);
const list = z.array(text(300)).max(40).default([]);
export const entityId = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,128}$/)
  .refine((x) => !['__proto__', 'constructor', 'prototype'].includes(x), 'Identificador reservado');
export const httpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        !['localhost', '127.0.0.1', '::1'].includes(u.hostname) &&
        !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)
      );
    } catch {
      return false;
    }
  }, 'URL HTTPS pública requerida');
export const brandSchema = z
  .object({
    name: required(),
    description: text(),
    sector: text(200),
    audience: text(),
    tone: text(300),
    language: z.enum(['es', 'en', 'pt', 'fr']).default('es'),
    preferredWords: list,
    forbiddenWords: list,
    allowedClaims: list,
    sensitiveClaims: list,
    colors: z
      .array(z.string().regex(/^#[a-fA-F0-9]{6}$/))
      .max(12)
      .default([]),
    logos: z.array(httpsUrl).max(5).default([]),
    productInfo: text(6000),
    urls: z.array(httpsUrl).max(10).default([]),
    instructions: text(3000),
  })
  .strict();
export const campaignSchema = z
  .object({
    name: required(),
    brandId: entityId,
    objective: text(),
    platform: z.enum(['Meta', 'Google', 'TikTok', 'Otro']),
    country: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();
export const briefSchema = z
  .object({
    campaignId: entityId,
    title: required(),
    objective: required(2000),
    offer: text(),
    cta: text(300),
    constraints: text(),
    format: z.enum(['1:1', '4:5', '9:16', '16:9']).default('1:1'),
  })
  .strict();
export const jobSchema = z
  .object({
    briefId: entityId,
    kind: z.enum(['copy', 'image', 'video', 'voice']),
    copyAssetId: entityId.optional(),
    quality: z.enum(['standard', 'high']).default('standard'),
    duration: z.number().int().min(1).max(60).default(8),
    resolution: z.enum(['1024', '1536', '720p', '1080p']).default('1024'),
  })
  .strict();
export const metricSchema = z
  .object({
    sourceId: entityId,
    campaignId: entityId,
    date: z.string().date(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    spend: z.number().finite().min(0).max(1e9),
    impressions: z.number().int().min(0),
    clicks: z.number().int().min(0),
    conversions: z.number().finite().min(0),
    revenue: z.number().finite().min(0).max(1e9),
    evidence: required(2000),
  })
  .strict()
  .refine((x) => x.clicks <= x.impressions, 'Clics superiores a impresiones');
export const sourceSchema = z
  .object({
    name: required(),
    platform: required(80),
    type: z.enum(['manual', 'csv', 'api']),
    evidence: required(2000),
  })
  .strict();
export const trendSchema = z
  .object({
    title: required(200),
    sourceId: entityId,
    url: httpsUrl,
    observedAt: z.string().datetime(),
    market: required(50),
    platform: required(80),
    evidence: required(4000),
    coverage: required(1000),
    confidence: z.enum(['baja', 'media', 'alta']),
  })
  .strict()
  .refine((x) => Date.parse(x.observedAt) <= Date.now(), 'Fecha futura no permitida');
export const memberSchema = z
  .object({ uid: entityId, role: z.enum(['editor', 'viewer']) })
  .strict();
export const assetSchema = z
  .object({ name: required(200), content: text(10000), mime: z.literal('text/plain') })
  .strict();
export function parse(schema, input) {
  return schema.parse(input);
}
