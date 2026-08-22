/**
 * g2 — pulso. ¿La fuente sigue publicando, o es un feed zombie?
 *
 * Cubre el modo de fallo #1 de §14.1, medido en campo: W Radio devolvía HTTP
 * 200 con XML válido congelado desde octubre de 2025. Un gate que mire el
 * status o el content-type lo da por vivo. La señal es
 * `max(fecha_del_hecho)` contra la cadencia declarada en `sources.ts`.
 *
 * Y el modo #4, fuente podrida: Gestor Normativo `i=53646`, ficha sin
 * refrescar desde 2015-12-01. Misma métrica, otra escala.
 *
 * ## Lo que este fichero NO hace
 *
 * No implementa g1–g6. No usa una banda [p05, p95] de 90 días: esa receta
 * sobre ~20 fuentes da P(≥1 bloqueo falso al día) = 1 − 0,9²⁰ = **87,8 %**,
 * y un gate que se dispara a diario se acaba desactivando (§14.2). Cadencia
 * absoluta de `sources.ts` + holgura explícita.
 *
 * Nadie leía `cadenciaHoras` antes de este módulo. El comentario de
 * `sources.ts` que decía «alimenta el gate de pulso» pasa a ser cierto.
 */

import { getSource } from "../sources.ts";

/** Holgura sobre la cadencia de los HECHOS. La captura propia usa otra. */
export const HOLGURA_HECHO = 3;
/**
 * Holgura sobre NUESTRA captura. Un cron diario puede llegar a las 25 h;
 * 2× cubre el desfase del runner sin aceptar una semana de silencio.
 */
export const HOLGURA_CAPTURA = 2;

export type PulsoOutcome =
  | "ok"
  | "zombie"
  | "captura_stale"
  | "sin_cadencia"
  | "sin_fecha_del_hecho";

export interface PulsoEntrada {
  readonly sourceKey: string;
  /**
   * El hecho más reciente del payload parseado. `null` cuando la fuente no
   * publica fechas (Senado PDLY: los 9 campos medidos no incluyen ninguna).
   * No se infiere de la legislatura ni de `capturedAt`.
   */
  readonly fechaHechoMasReciente: string | null;
  /** Cuándo pedimos nosotros, no cuándo publicó la fuente. */
  readonly capturadoEn: string;
  readonly ahora: string;
}

export interface PulsoVeredicto {
  readonly gate: "g2-pulso";
  readonly outcome: PulsoOutcome;
  readonly sourceKey: string;
  readonly cadenciaHoras: number | null;
  readonly horasDesdeHecho: number | null;
  readonly horasDesdeCaptura: number | null;
  readonly reglaViolada?: string;
  readonly esperado?: string;
  readonly observado?: string;
}

function horasEntre(desdeIso: string, hastaIso: string): number {
  const a = Date.parse(desdeIso);
  const b = Date.parse(hastaIso);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`fecha ISO inválida: ${desdeIso} .. ${hastaIso}`);
  }
  return (b - a) / 3_600_000;
}

/**
 * Juzga una corrida contra la cadencia declarada de su fuente.
 *
 * Orden de las señales, y por qué no se mezclan:
 *
 * 1. Sin `cadenciaHoras` no hay pulso que medir (DNP no declara). No es ok:
 *    es `sin_cadencia`, para que nadie lea un verde donde no hubo juicio.
 * 2. Si NOSOTROS no hemos capturado dentro de `cadencia × HOLGURA_CAPTURA`,
 *    el pipeline está parado. Eso no dice nada de la fuente.
 * 3. Si capturamos reciente y el hecho más nuevo es más viejo que
 *    `cadencia × HOLGURA_HECHO`, la fuente está congelada: **zombie**.
 * 4. Si no hay `fecha_del_hecho`, no se puede marcar zombie. Senado PDLY
 *    vive aquí: se juzga la captura, no el contenido.
 */
export function g2Pulso(entrada: PulsoEntrada): PulsoVeredicto {
  let cadencia: number | undefined;
  try {
    cadencia = getSource(entrada.sourceKey).cadenciaHoras;
  } catch (e) {
    return {
      gate: "g2-pulso",
      outcome: "sin_cadencia",
      sourceKey: entrada.sourceKey,
      cadenciaHoras: null,
      horasDesdeHecho: null,
      horasDesdeCaptura: null,
      reglaViolada: "fuente-no-declarada",
      observado: String(e),
    };
  }

  const horasDesdeCaptura = horasEntre(entrada.capturadoEn, entrada.ahora);
  const horasDesdeHecho = entrada.fechaHechoMasReciente
    ? horasEntre(entrada.fechaHechoMasReciente, entrada.ahora)
    : null;

  const base = {
    gate: "g2-pulso" as const,
    sourceKey: entrada.sourceKey,
    cadenciaHoras: cadencia ?? null,
    horasDesdeHecho,
    horasDesdeCaptura,
  };

  if (cadencia === undefined) {
    return { ...base, outcome: "sin_cadencia" };
  }

  const topeCaptura = cadencia * HOLGURA_CAPTURA;
  if (horasDesdeCaptura > topeCaptura) {
    return {
      ...base,
      outcome: "captura_stale",
      reglaViolada: "captura-fuera-de-cadencia",
      esperado: `captura hace ≤ ${topeCaptura} h (cadencia ${cadencia} × ${HOLGURA_CAPTURA})`,
      observado: `${horasDesdeCaptura.toFixed(1)} h desde ${entrada.capturadoEn}`,
    };
  }

  if (horasDesdeHecho === null) {
    return { ...base, outcome: "sin_fecha_del_hecho" };
  }

  const topeHecho = cadencia * HOLGURA_HECHO;
  if (horasDesdeHecho > topeHecho) {
    return {
      ...base,
      outcome: "zombie",
      reglaViolada: "hecho-fuera-de-cadencia",
      esperado: `max(fecha_del_hecho) hace ≤ ${topeHecho} h (cadencia ${cadencia} × ${HOLGURA_HECHO})`,
      observado: `${horasDesdeHecho.toFixed(1)} h desde ${entrada.fechaHechoMasReciente}`,
    };
  }

  return { ...base, outcome: "ok" };
}

/** El veredicto que debe romper una corrida. `sin_fecha` no: no hay señal. */
export function pulsoFallaCorrida(v: PulsoVeredicto): boolean {
  return v.outcome === "zombie" || v.outcome === "captura_stale";
}
