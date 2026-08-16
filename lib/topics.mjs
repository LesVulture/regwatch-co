/**
 * Clasificación temática léxica.
 *
 * Es léxica y no semántica a propósito. En un expediente de política pública hay
 * que poder responder «¿por qué este proyecto de ley quedó marcado como IA?» con
 * un término concreto, no con una distancia coseno. `classify` devuelve los
 * términos que dispararon cada tema, y la TUI los muestra. Ver GOVERNANCE.md §4.
 */
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function classify(text, topics) {
  const hay = norm(text);
  const out = [];
  for (const [key, t] of Object.entries(topics)) {
    const hits = t.terms.filter((term) => hay.includes(norm(term)));
    if (hits.length) out.push({ topic: key, label: t.label, hits });
  }
  return out.sort((a, b) => b.hits.length - a.hits.length);
}

/** Texto indexable de un registro. Nunca incluye campos derivados, para no realimentarse. */
export function indexableText(rec) {
  return [rec.title, rec.summary, rec.quote, rec.authority].filter(Boolean).join(' \n ');
}
