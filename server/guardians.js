import rules from '../config/compliance-rules.json' with { type: 'json' };
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
function occurrences(text, words, rule, severity, recommendation) {
  const normalized = fold(text);
  return words.flatMap((word) => {
    if (!word) return [];
    const index = normalized.indexOf(fold(word));
    return index < 0
      ? []
      : [
          {
            rule,
            severity,
            evidence: word,
            location: { start: index, end: index + word.length },
            recommendation,
          },
        ];
  });
}
export function brandGuardian(text, brand) {
  const issues = [
    ...occurrences(
      text,
      brand.forbiddenWords,
      'BRAND-FORBIDDEN',
      'alta',
      'Sustituye este término prohibido.',
    ),
    ...occurrences(
      text,
      brand.sensitiveClaims,
      'BRAND-SENSITIVE-CLAIM',
      'alta',
      'Verifica respaldo documental y aprobación de marca antes de publicar.',
    ),
  ];
  const review = [];
  const preferred = brand.preferredWords || [];
  if (preferred.length && !preferred.some((w) => fold(text).includes(fold(w))))
    issues.push({
      rule: 'BRAND-PREFERRED-WORDS',
      severity: 'recomendación',
      evidence: preferred.join(', '),
      location: null,
      recommendation: 'Valora incluir vocabulario preferido si encaja; no es obligatorio.',
    });
  const known = brand.productInfo + ' ' + (brand.allowedClaims || []).join(' ');
  for (const match of text.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:%|€|euros|gramos|kg|días|años)\b/gi))
    if (!fold(known).includes(fold(match[0])))
      issues.push({
        rule: 'BRAND-UNSUPPORTED-NUMBER',
        severity: 'media',
        evidence: match[0],
        location: { start: match.index, end: match.index + match[0].length },
        recommendation: 'Confirma esta cifra contra información o claims autorizados de la marca.',
      });
  if (/sin emojis/i.test(brand.instructions) && /\p{Extended_Pictographic}/u.test(text))
    issues.push({
      rule: 'BRAND-INSTRUCTION-EMOJI',
      severity: 'media',
      evidence: text.match(/\p{Extended_Pictographic}/u)[0],
      location: null,
      recommendation: 'Elimina emojis según la instrucción explícita de marca.',
    });
  const max = brand.instructions.match(/m[aá]ximo (\d+) caracteres/i);
  if (max && text.length > Number(max[1]))
    issues.push({
      rule: 'BRAND-INSTRUCTION-LENGTH',
      severity: 'media',
      evidence: `${text.length} caracteres; máximo ${max[1]}`,
      location: null,
      recommendation: 'Acorta el texto para respetar la instrucción de marca.',
    });
  if (brand.tone) {
    if (/formal/i.test(brand.tone) && /\b(tío|colega|bro)\b/i.test(text))
      issues.push({
        rule: 'BRAND-TONE',
        severity: 'media',
        evidence: text.match(/\b(tío|colega|bro)\b/i)[0],
        location: null,
        recommendation: 'Utiliza un registro formal.',
      });
    else
      review.push({
        rule: 'BRAND-TONE',
        expected: brand.tone,
        status: 'revisión semántica pendiente',
      });
  }
  const markers = {
    es: /\b(el|la|para|con|descubre|tu|una)\b/gi,
    en: /\b(the|with|your|discover|and)\b/gi,
    pt: /\b(voce|você|seu|uma|descubra)\b/gi,
    fr: /\b(votre|avec|pour|decouvrez|découvrez)\b/gi,
  };
  const counts = Object.fromEntries(
    Object.entries(markers).map(([lang, re]) => [lang, (text.match(re) || []).length]),
  );
  const likely = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (counts[likely] >= 3 && likely !== brand.language)
    issues.push({
      rule: 'BRAND-LANGUAGE',
      severity: 'media',
      evidence: `Señales lingüísticas: ${likely}; esperado ${brand.language}`,
      location: null,
      recommendation: 'Revisa idioma. Es una heurística, no una detección certificada.',
    });
  else
    review.push({
      rule: 'BRAND-LANGUAGE',
      expected: brand.language,
      status: 'heurística limitada; revisión humana',
    });
  for (const [rule, expected] of [
    ['BRAND-FACTS', brand.productInfo],
    ['BRAND-INSTRUCTIONS', brand.instructions],
  ])
    if (expected)
      review.push({ rule, expected, status: 'revisión semántica/documental pendiente' });
  return {
    version: 'brand-1',
    issues,
    review,
    status: issues.some((i) => i.severity === 'alta') ? 'requires_review' : 'limited_checks',
    disclaimer: 'Comprobaciones básicas; no certifica tono, veracidad ni cumplimiento completo.',
  };
}
export function complianceGuardian(text, brand, campaign) {
  const issues = [];
  for (const r of rules.rules) {
    const matches = (arr, value) => arr.includes('*') || arr.some((x) => fold(x) === fold(value));
    if (
      matches(r.platforms, campaign.platform) &&
      matches(r.countries, campaign.country) &&
      matches(r.sectors, brand.sector)
    )
      issues.push(
        ...occurrences(text, r.phrases, r.id, r.severity, r.recommendation).map((i) => ({
          ...i,
          layer: r.layer,
          country: campaign.country,
          platform: campaign.platform,
        })),
      );
  }
  return {
    version: rules.version,
    status: rules.status,
    issues,
    uncovered: [
      'legislación específica del país',
      'derechos de imagen/voz',
      'políticas completas vigentes',
    ],
    disclaimer:
      'Evaluación orientativa de riesgo. No garantiza legalidad ni aprobación de plataformas.',
  };
}
export function metrics(row) {
  return {
    CPA: row.conversions > 0 ? row.spend / row.conversions : null,
    ROAS: row.spend > 0 ? row.revenue / row.spend : null,
    CTR: row.impressions > 0 ? (100 * row.clicks) / row.impressions : null,
    CPC: row.clicks > 0 ? row.spend / row.clicks : null,
  };
}
export function roiIndex(row) {
  return {
    status: 'EXPERIMENTAL',
    value: row.spend > 0 ? (100 * (row.revenue - row.spend)) / row.spend : null,
    scale: 'porcentaje, sin límite superior; mínimo -100%',
    formula: '100 × (ingresos atribuidos − gasto publicitario) / gasto publicitario',
    limitations:
      'Retorno publicitario bruto; excluye margen de producto, otros costes e incertidumbre de atribución. No predice beneficios.',
  };
}
