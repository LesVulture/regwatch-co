/**
 * Mapeo argv/URL → las mismas opciones que la web y el MCP.
 *
 * El TUI no tiene un parser de filtros propio: reutiliza `parsearFiltros`.
 * Lo que vive aquí es cómo se leen las flags de la línea de comando y cómo
 * se ciclan los valores en el teclado.
 */

import {
  CAMARAS,
  ESTADOS_TRAMITE,
  type FiltrosResueltos,
  ORIGENES,
  type ParamsFiltro,
  parsearFiltros,
} from "../../web/src/lib/filtros.ts";

export const LEGISLATURAS_CICLO = [
  "",
  "2022-2023",
  "2023-2024",
  "2024-2025",
  "2025-2026",
  "2026-2027",
] as const;

export const TIPOS_CICLO = ["", ...ORIGENES] as const;
export const CAMARAS_CICLO = ["", ...CAMARAS] as const;
export const ESTADOS_CICLO = ["", ...ESTADOS_TRAMITE] as const;

const FLAGS = new Set([
  "q",
  "tipo",
  "legislatura",
  "estado",
  "camara",
  "anio",
  "tipo_providencia",
  "comision",
  "page",
]);

/**
 * `--q=salud` o `--tipo=proyecto_ley`. Un argumento sin `--` se concatena a `q`.
 */
export function parsearArgv(argv: readonly string[]): ParamsFiltro {
  const raw: Record<string, string> = {};
  const sueltos: string[] = [];
  for (const a of argv) {
    if (a === "--help" || a === "-h") continue;
    const m = /^--([a-z_]+)=(.*)$/.exec(a);
    if (m) {
      const k = m[1] ?? "";
      if (FLAGS.has(k)) raw[k] = m[2] ?? "";
      continue;
    }
    if (!a.startsWith("-")) sueltos.push(a);
  }
  if (raw.q === undefined && sueltos.length > 0) raw.q = sueltos.join(" ");
  return {
    ...(raw.q !== undefined ? { q: raw.q } : {}),
    ...(raw.tipo !== undefined ? { tipo: raw.tipo } : {}),
    ...(raw.legislatura !== undefined ? { legislatura: raw.legislatura } : {}),
    ...(raw.estado !== undefined ? { estado: raw.estado } : {}),
    ...(raw.camara !== undefined ? { camara: raw.camara } : {}),
    ...(raw.anio !== undefined ? { anio: raw.anio } : {}),
    ...(raw.tipo_providencia !== undefined ? { tipo_providencia: raw.tipo_providencia } : {}),
    ...(raw.comision !== undefined ? { comision: raw.comision } : {}),
    ...(raw.page !== undefined ? { page: raw.page } : {}),
  };
}

export function opcionesDesdeArgv(argv: readonly string[]): FiltrosResueltos {
  return parsearFiltros(parsearArgv(argv));
}

export function siguiente(lista: readonly string[], actual: string): string {
  const i = lista.indexOf(actual);
  const n = i < 0 ? 0 : (i + 1) % lista.length;
  return lista[n] ?? "";
}

export function anterior(lista: readonly string[], actual: string): string {
  const i = lista.indexOf(actual);
  const n = i < 0 ? 0 : (i - 1 + lista.length) % lista.length;
  return lista[n] ?? "";
}
