/**
 * Registro de expectativas por fuente.
 *
 * Cada entrada declara qué debe devolver una fuente sana, para que los gates
 * puedan comparar contra algo en vez de confiar en el código HTTP. Todos los
 * valores salen de mediciones reales documentadas en `research/`, no de
 * suposiciones — la referencia va en `evidencia` para que se pueda re-verificar.
 *
 * Cuando una fuente cambie, este fichero es lo que hay que actualizar. Es
 * deliberadamente aburrido y explícito: es la tabla que un humano mantiene.
 */

import type { Tier } from "./evidence.js";

/** Qué formato debe traer el cuerpo. Se valida parseando, nunca por status. */
export type BodyKind = "json" | "xml" | "html" | "pdf";

export interface SourceExpectation {
  readonly key: string;
  readonly nombre: string;
  /** Rol probatorio máximo que esta fuente puede sostener. */
  readonly tier: Tier;
  readonly bodyKind: BodyKind;
  /**
   * Content-Type que declara la fuente sana. Se compara por prefijo porque
   * los servidores añaden charset.
   */
  readonly contentTypePrefix: string;
  /**
   * Umbral ABSOLUTO de una cara, en bytes. Por debajo de esto, la respuesta
   * es un cascarón o una página de error.
   *
   * Deliberadamente NO es una banda [p05,p95]: con ~20 fuentes, una banda de
   * dos caras al 90 % da P(≥1 bloqueo falso al día) = 1 − 0,9²⁰ = 87,8 %, y
   * un gate que se dispara a diario se acaba desactivando (§14.2).
   */
  readonly minBytes: number;
  /**
   * Marcadores que, si aparecen, significan error aunque el status sea 200.
   * Medidos, no imaginados.
   */
  readonly errorMarkers?: readonly string[];
  /** Si la fuente NO soporta HTTPS. Medido, no asumido. */
  readonly httpOnly?: boolean;
  /** Charset cuando no es UTF-8. */
  readonly charset?: string;
  /** Cadencia esperada de publicación, en horas. Alimenta el gate de pulso. */
  readonly cadenciaHoras?: number;
  /** De dónde sale cada número de arriba. */
  readonly evidencia: string;
}

export const SOURCES: Record<string, SourceExpectation> = {
  "senado-pdly": {
    key: "senado-pdly",
    nombre: "Senado — API de proyectos de ley",
    tier: "primaria",
    bodyKind: "json",
    contentTypePrefix: "application/json",
    minBytes: 2_000,
    cadenciaHoras: 24,
    evidencia:
      "refute2-congreso.json: POST search_pdly.php con legislatura=2026-2027 → 200, " +
      "application/json, 131.849 bytes, 191 filas. Sin filtro topa en 100 filas.",
  },

  "camara-ajax": {
    key: "camara-ajax",
    nombre: "Cámara — admin-ajax de proyectos de ley",
    tier: "primaria",
    bodyKind: "json",
    contentTypePrefix: "application/json",
    minBytes: 1_000,
    cadenciaHoras: 24,
    evidencia:
      "refute2-congreso.json: POST admin-ajax.php action=get_proyectos_ley_page → " +
      "{success,data:{items,total,total_pages}}. El _ajax_nonce NO se valida: " +
      'responde igual con nonce falso y omitiéndolo. 6.446 registros bajados con nonce="x".',
  },

  "senado-basedoc": {
    key: "senado-basedoc",
    nombre: "Secretaría del Senado (basedoc) — texto normativo y notas",
    tier: "primaria",
    bodyKind: "html",
    contentTypePrefix: "text/html",
    minBytes: 20_000,
    httpOnly: true,
    charset: "ISO-8859-1",
    cadenciaHoras: 24 * 7,
    evidencia:
      "normativa.json + refute-normativa.json: solo responde por HTTP (nc -zv :443 → " +
      "timeout). Página de ley real ~83.174 bytes. Las cajas de notas vienen VACÍAS en " +
      'el HTML; el contenido vive en js/{slug}.js como insRowN(). Sello "Última ' +
      'actualización" legible por máquina, latencia medida de 4 días.',
  },

  "corte-relatoria": {
    key: "corte-relatoria",
    nombre: "Corte Constitucional — relatoría (Elasticsearch)",
    tier: "primaria",
    bodyKind: "json",
    contentTypePrefix: "application/json",
    minBytes: 5_000,
    cadenciaHoras: 24,
    errorMarkers: ["<html", "<!DOCTYPE"],
    evidencia:
      "refute-jurisprudencia.json: maxprov=10001 devuelve HTTP 200 con 2.882 bytes de " +
      "FRAGMENTO HTML, no JSON. Un ingestor que valide solo el status registra cero " +
      "resultados en silencio. De ahí los errorMarkers.",
  },

  "dnp-conpes": {
    key: "dnp-conpes",
    nombre: "DNP — documentos CONPES",
    tier: "primaria",
    bodyKind: "pdf",
    contentTypePrefix: "application/pdf",
    minBytes: 50_000,
    evidencia:
      "normativa.json: ~4.200 PDFs nativos en carpeta plana bajo /CDT/Conpes/Económicos/, " +
      "sin auth ni JS. OJO: su ToS prohíbe robots sin autorización escrita (§15.1).",
  },
};

/** Fuentes excluidas a propósito, con el motivo. Existir aquí es la decisión. */
export const EXCLUIDAS: Record<string, string> = {
  lasillavacia:
    "Su robots.txt excluye ClaudeBot, anthropic-ai, Claude-Web, GPTBot, CCBot y " +
    "Google-Extended. Se acata: fuera de la ingesta automatizada. Una exclusión no se " +
    "rodea. Evidencia: refute2-prensa.json.",
  "funcionpublica-vigencia":
    'El Gestor Normativo se autodesautoriza para vigencia ("NO SE HACE RESPONSABLE DE ' +
    'LA VIGENCIA") y tiene fichas sin refrescar desde 2015-12-01. Sirve para el grafo ' +
    "de afectaciones, NUNCA como autoridad de vigencia. Evidencia: refute-normativa.json.",
  "consejo-estado-samai":
    "Su robots.txt prohíbe /*.aspx?* — es decir, toda su superficie útil — y su JWT " +
    "expira en ~1 hora. Queda como secundaria de consulta manual. Evidencia: " +
    "refute-jurisprudencia.json.",
};

export function getSource(key: string): SourceExpectation {
  const s = SOURCES[key];
  if (!s) {
    const excluida = EXCLUIDAS[key];
    if (excluida) {
      throw new Error(`La fuente "${key}" está excluida a propósito: ${excluida}`);
    }
    throw new Error(`Fuente desconocida: "${key}". Debe declararse en sources.ts antes de usarse.`);
  }
  return s;
}
