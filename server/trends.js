export function freshness(trend, at = Date.now()) {
  const ageHours = Math.max(0, (at - Date.parse(trend.observedAt)) / 3600000);
  return {
    ageHours: Math.round(ageHours),
    state: ageHours <= 48 ? 'reciente' : ageHours <= 168 ? 'envejeciendo' : 'antigua',
    score: Math.max(0, Math.round(100 * (1 - ageHours / 168))),
    method: 'freshness-1: 100 × max(0, 1 − horas/168). Mide frescura, NO popularidad ni veracidad.',
  };
}
export class SourceAdapter {
  async ingest() {
    throw new Error('Fuente externa no configurada');
  }
}
export class ManualSourceAdapter extends SourceAdapter {
  async ingest(rows) {
    return rows.map((row) => ({ ...row, origin: 'manual', verification: 'aportado por usuario' }));
  }
}
