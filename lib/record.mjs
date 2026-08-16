/**
 * Esquema de registro y validación de procedencia.
 *
 * Este archivo es el corazón del proyecto y conviene decir por qué: un monitor
 * normativo sin procedencia obligatoria no es una herramienta de política, es un
 * rumor con formato de tabla. Aquí la procedencia no se pide en la documentación
 * y se confía a la disciplina: se valida en código, y `bin/verify.mjs` sale con
 * código 1 si falta. Ver GOVERNANCE.md §2 y §3.
 */

/** Jerarquía probatoria. El orden importa: `tier` de un registro nunca supera al de su fuente. */
export const TIERS = ['primaria', 'institucional', 'secundaria'];

/** Cómo se obtuvo el contenido. `verbatim` permite citar; `resumen` NO. */
export const CAPTURES = ['verbatim', 'resumen'];

/** Estado de vigencia. `desconocida` es una respuesta legítima y frecuente. */
export const STATUSES = ['vigente', 'derogada', 'en-tramite', 'archivada', 'desconocida'];

export const KINDS = [
  'ley', 'decreto', 'resolucion', 'circular', 'concepto',
  'conpes', 'proyecto-ley', 'sentencia', 'comunicado', 'politica',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida un registro. Devuelve un array de errores (vacío = válido).
 * No lanza: el llamador decide si un registro inválido se descarta o se reporta.
 */
export function validateRecord(rec, { sources = {} } = {}) {
  const e = [];
  const req = (k) => {
    if (rec[k] === undefined || rec[k] === null || rec[k] === '') e.push(`falta '${k}'`);
  };

  ['id', 'kind', 'title', 'source', 'source_url', 'retrieved_at', 'tier', 'capture', 'status'].forEach(req);

  if (rec.kind && !KINDS.includes(rec.kind)) e.push(`'kind' desconocido: ${rec.kind}`);
  if (rec.tier && !TIERS.includes(rec.tier)) e.push(`'tier' desconocido: ${rec.tier}`);
  if (rec.capture && !CAPTURES.includes(rec.capture)) e.push(`'capture' desconocido: ${rec.capture}`);
  if (rec.status && !STATUSES.includes(rec.status)) e.push(`'status' desconocido: ${rec.status}`);

  // --- Procedencia: la regla que da sentido al proyecto -----------------------
  if (rec.source_url && !/^https?:\/\//.test(rec.source_url)) {
    e.push(`'source_url' debe ser una URL http(s) checkeable: ${rec.source_url}`);
  }
  if (rec.retrieved_at && !ISO_DATE.test(rec.retrieved_at)) {
    e.push(`'retrieved_at' debe ser YYYY-MM-DD: ${rec.retrieved_at}`);
  }
  if (rec.date && !ISO_DATE.test(rec.date)) {
    e.push(`'date' debe ser YYYY-MM-DD: ${rec.date}`);
  }

  // Un registro no puede reclamar mejor evidencia que la fuente de la que salió.
  const src = sources[rec.source];
  if (rec.source && !src) {
    e.push(`'source' no está en config/sources.json: ${rec.source}`);
  } else if (src && rec.tier && TIERS.indexOf(rec.tier) < TIERS.indexOf(src.tier)) {
    e.push(`tier '${rec.tier}' supera al de su fuente '${rec.source}' ('${src.tier}') — imposible`);
  }

  // Citar exige haber capturado el texto literal.
  if (rec.quote && rec.capture !== 'verbatim') {
    e.push(`tiene 'quote' pero capture='${rec.capture}': solo se cita lo capturado verbatim`);
  }

  // Afirmar vigencia exige fuente primaria. Una nota de prensa no declara vigencia.
  if (rec.status === 'vigente' && rec.tier !== 'primaria') {
    e.push(`status='vigente' exige tier='primaria'; este registro es '${rec.tier}'`);
  }

  return e;
}

/** Construye un registro normalizado. `extra` se conserva tal cual. */
export function makeRecord({
  id, kind, title, source, source_url, retrieved_at,
  tier, capture = 'resumen', status = 'desconocida',
  date = null, authority = null, summary = '', quote = null,
  topics = [], antecedents = [], ...extra
}) {
  return {
    id, kind, title, source, source_url, retrieved_at,
    tier, capture, status, date, authority,
    summary, quote, topics, antecedents, ...extra,
  };
}

/** Identificador estable y legible. No usa azar: el mismo registro produce el mismo id. */
export function slugId(kind, ...parts) {
  const s = parts.join('-').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${kind}:${s}`;
}
