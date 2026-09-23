export function usageSummary(org) {
  const groups = { users: {}, operations: {}, providers: {}, models: {} };
  const total = { jobs: 0, credits: 0, knownUSD: 0, pendingEstimateUSD: 0, adminJobs: 0 };
  for (const u of org.usage) {
    const values = {
      jobs: 1,
      credits: u.creditsConsumed || 0,
      knownUSD: u.costActualUSD || 0,
      pendingEstimateUSD: ['reserved', 'uncertain', 'cost_pending'].includes(u.status)
        ? u.costEstimatedUSD
        : 0,
      adminJobs: u.adminTest ? 1 : 0,
    };
    for (const key of Object.keys(total)) total[key] += values[key];
    for (const [kind, id] of [
      ['users', u.userId],
      ['operations', u.operation],
      ['providers', u.provider],
      ['models', u.model],
    ]) {
      groups[kind][id] ??= {
        jobs: 0,
        credits: 0,
        knownUSD: 0,
        pendingEstimateUSD: 0,
        adminJobs: 0,
      };
      for (const key of Object.keys(values)) groups[kind][id][key] += values[key];
    }
  }
  return {
    organizationId: org.id,
    total,
    groups,
    revenueMode: 'TEST_ONLY',
    margin: {
      value: null,
      status: 'NO_CALCULABLE',
      reason:
        'Faltan ingresos netos reales, impuestos, infraestructura, soporte, divisas y costes pendientes. No se presenta ingreso bruto como beneficio.',
    },
  };
}
