/**
 * Normalización de estados de trámite.
 *
 * El plan lo marca como work item propio, y con razón: `estado` es **texto
 * libre**. La auditoría contó **77 valores distintos en 116 filas** del corpus
 * histórico; medido de primera mano el 2026-08-19 sobre dos legislaturas
 * completas (665 filas) salen **13**, y entre ellos ya conviven
 * `RADICADO EN CAMARA` y `RADICADO EN CÁMARA` — el mismo estado, con y sin
 * tilde, en la misma fuente.
 *
 * Sin esta capa, cualquier consulta por estado cuenta mal, y lo hace en
 * silencio: `GROUP BY estado` devuelve dos filas donde hay un solo hecho.
 *
 * **Regla que gobierna este fichero:** un valor no reconocido NO se descarta,
 * NO se adivina y NO se mete en un cajón «otros». Se marca `desconocido`, se
 * conserva el original y va a la cola de revisión. Cada vez que aparezca uno,
 * es una decisión humana de una línea — y esa es exactamente la clase de
 * trabajo que el presupuesto de horas de §11 bis contabiliza.
 */

/**
 * Estados canónicos. Deliberadamente pocos: describen el punto del trámite,
 * no el matiz administrativo. El matiz vive en el original, que se conserva.
 */
export const ESTADOS_CANONICOS = [
  "radicado",
  "en_comision",
  "en_plenaria",
  "aprobado_camara_origen",
  "en_camara_revisora",
  "conciliacion",
  "aprobado_congreso",
  "sancion_presidencial",
  "ley",
  "objetado",
  "control_constitucional",
  "archivado",
  "retirado",
  /** El valor de la fuente no está en el mapa. Va a revisión, no al vacío. */
  "desconocido",
] as const;

export type EstadoCanonico = (typeof ESTADOS_CANONICOS)[number];

/**
 * Mapa de valores observados → estado canónico.
 *
 * Las claves están normalizadas (sin tildes, sin espacios dobles, mayúsculas),
 * así que `RADICADO EN CAMARA` y `RADICADO EN CÁMARA` colapsan a la misma
 * entrada sin necesidad de duplicarla aquí. Cada entrada salió de datos
 * reales: no hay estados imaginados en este mapa.
 */
const MAPA: Record<string, EstadoCanonico> = {
  // — medidos en las legislaturas cerradas —
  ARCHIVADO: "archivado",
  "ARCHIVADO POR RETIRO DEL AUTOR": "retirado",
  LEY: "ley",
  "PENDIENTE DESIGNAR PONENTES EN SENADO": "radicado",
  "PENDIENTE DE ENVIAR A COMISION": "radicado",
  "PENDIENTE ENVIAR A SANCION": "aprobado_congreso",
  "SANCION PRESIDENCIAL": "sancion_presidencial",
  "CORTE CONSTITUCIONAL": "control_constitucional",
  "PENDIENTE ENVIAR A CORTE": "control_constitucional",
  "RADICADO EN CAMARA": "en_camara_revisora",
  OBJETADO: "objetado",
  CONCILIACION: "conciliacion",

  // — los 10 que solo enseña la legislatura activa (medidos 2026-08-20) —
  //
  // PRIMER debate = comisión · SEGUNDO debate = plenaria. Se clasifica por
  // ETAPA, no por cámara: la cámara va aparte en `camaraMencionada`, porque
  // deducirla como estado exigiría saber la cámara de origen del proyecto.
  "PENDIENTE RENDIR PONENCIA PARA PRIMER DEBATE EN SENADO": "en_comision",
  "PENDIENTE DISCUTIR PONENCIA PARA PRIMER DEBATE EN SENADO": "en_comision",
  "PENDIENTE RENDIR PONENCIA PARA SEGUNDO DEBATE EN SENADO": "en_plenaria",
  "PENDIENTE DISCUTIR PONENCIA PARA SEGUNDO DEBATE EN SENADO": "en_plenaria",
  "PENDIENTE RENDIR PONENCIA PARA PRIMER DEBATE EN CAMARA": "en_comision",
  "PENDIENTE RENDIR PONENCIA PARA SEGUNDO DEBATE EN CAMARA": "en_plenaria",
  "PENDIENTE DISCUTIR PONENCIA PARA SEGUNDO DEBATE EN CAMARA": "en_plenaria",

  // Estos SÍ dicen dónde está el proyecto, no en qué etapa: aprobado en su
  // cámara y camino de la otra, o ya llegado a la revisora.
  "PENDIENTE DE ENVIAR A CAMARA": "aprobado_camara_origen",
  "PENDIENTE DESIGNAR PONENTES EN CAMARA": "en_camara_revisora",
  "PENDIENTE DE ENVIAR A COMISION EN CAMARA": "en_camara_revisora",
};

/** Qué cámara nombra el estado, si nombra alguna. Es el SEGUNDO eje. */
export type CamaraMencionada = "senado" | "camara" | null;

function camaraDe(claveNormalizada: string): CamaraMencionada {
  if (/\bSENADO\b/.test(claveNormalizada)) return "senado";
  if (/\bCAMARA\b/.test(claveNormalizada)) return "camara";
  return null;
}

/**
 * Quita tildes y homogeneiza espacios para que la comparación no dependa de
 * la ortografía del funcionario que capturó el dato.
 */
export function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

export interface EstadoNormalizado {
  readonly canonico: EstadoCanonico;
  /** El valor tal como lo publicó la fuente. Se conserva SIEMPRE. */
  readonly original: string;
  /** `true` si hubo que mandarlo a revisión humana. */
  readonly requiereRevision: boolean;
  /**
   * El segundo eje: qué cámara nombra el estado. `null` cuando no nombra
   * ninguna (`ARCHIVADO`, `LEY`…). Se devuelve aparte a propósito — meterlo
   * en `canonico` obligaría a adivinar la cámara de origen del proyecto.
   */
  readonly camaraMencionada: CamaraMencionada;
}

/**
 * Normaliza un estado de trámite.
 *
 * Nunca lanza: un estado desconocido es un dato que hay que gestionar, no una
 * excepción que aborte un lote de 471 filas.
 */
export function normalizarEstado(raw: string | null | undefined): EstadoNormalizado {
  const original = (raw ?? "").trim();

  if (!original) {
    return { canonico: "desconocido", original, requiereRevision: true, camaraMencionada: null };
  }

  const clave = normalizarTexto(original);
  const canonico = MAPA[clave];
  const camaraMencionada = camaraDe(clave);

  if (!canonico) {
    // Un valor nuevo NO se adivina por parecido: «PENDIENTE …» aparece en
    // cuatro puntos distintos del trámite, y colocarlo mal es peor que
    // declararlo. Se devuelve la cámara igualmente: es dato observado, no
    // inferencia, y le ahorra trabajo a quien revise.
    return { canonico: "desconocido", original, requiereRevision: true, camaraMencionada };
  }

  return { canonico, original, requiereRevision: false, camaraMencionada };
}

/** Los valores crudos que este mapa ya reconoce. Útil para tests y auditoría. */
export function valoresConocidos(): readonly string[] {
  return Object.keys(MAPA);
}
