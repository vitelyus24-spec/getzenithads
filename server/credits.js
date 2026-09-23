import { fail } from './core.js';
export function wallet(org) {
  org.wallet ??= { included: org.creditBalance || 0, purchased: 0 };
  return org.wallet;
}
export function balance(org) {
  const w = wallet(org);
  org.creditBalance = w.included + w.purchased;
  return org.creditBalance;
}
export function reserve(org, amount, admin = false) {
  fail(Number.isSafeInteger(amount) && amount >= 0, 500, 'CREDIT_AMOUNT', 'Créditos inválidos');
  const w = wallet(org);
  if (admin) return { included: 0, purchased: 0, waived: amount };
  fail(balance(org) >= amount, 402, 'INSUFFICIENT_CREDITS', 'Saldo insuficiente');
  const included = Math.min(w.included, amount),
    purchased = amount - included;
  w.included -= included;
  w.purchased -= purchased;
  balance(org);
  return { included, purchased, waived: 0 };
}
export function settle(org, reservation, consumed) {
  const reserved = reservation.included + reservation.purchased;
  fail(
    Number.isSafeInteger(consumed) && consumed >= 0 && consumed <= reserved,
    500,
    'CREDIT_SETTLEMENT',
    'Conciliación inválida',
  );
  const usedIncluded = Math.min(reservation.included, consumed),
    usedPurchased = consumed - usedIncluded;
  const w = wallet(org);
  w.included += reservation.included - usedIncluded;
  w.purchased += reservation.purchased - usedPurchased;
  balance(org);
  return { included: usedIncluded, purchased: usedPurchased, released: reserved - consumed };
}
export function grant(org, bucket, amount) {
  fail(
    ['included', 'purchased'].includes(bucket) && Number.isSafeInteger(amount) && amount > 0,
    500,
    'CREDIT_GRANT',
    'Abono inválido',
  );
  const w = wallet(org);
  w[bucket] += amount;
  balance(org);
}
// Internal experimental units, not a public commercial commitment. Configurable by operation/model.
export function quoteCredits(
  config,
  { kind, model, quality = 'standard', duration = 8, resolution = '1024', estimatedUSD = 0 },
) {
  const rule = config.operations[kind];
  fail(rule, 400, 'OPERATION_UNKNOWN', 'Operación desconocida');
  const qualityFactor = config.multipliers.quality[quality] || 1,
    resolutionFactor = config.multipliers.resolution[resolution] || 1,
    modelFactor = config.multipliers.model[model] || 1;
  const durationFactor = ['video', 'voice'].includes(kind)
    ? Math.max(1, duration / (kind === 'video' ? 8 : 60))
    : 1;
  return Math.ceil(
    Math.max(
      rule.credits * qualityFactor * resolutionFactor * modelFactor * durationFactor,
      estimatedUSD / config.internalUSDPerCredit,
    ),
  );
}
