/**
 * Consultas del TUI: misma frontera que la web y el MCP.
 */

import {
  buscar,
  fichaProvidencia,
  fichaProyecto,
  identidadNorma,
  vigencia,
} from "../../web/src/lib/consultas.ts";
import { embeberConsulta } from "../../web/src/lib/embedding-consulta.ts";
import {
  advertenciaFiltros,
  type ParamsFiltro,
  parsearFiltros,
} from "../../web/src/lib/filtros.ts";
import { consultanteDesdeEntorno } from "../../web/src/lib/supabase.ts";

export function lineaFila(f: Record<string, unknown>): string {
  return `[${String(f.origen)}] ${String(f.referencia ?? "")} — ${String(f.titulo ?? "(sin título)")}`;
}

export function pieFila(f: Record<string, unknown>): string {
  return (
    `fuente: ${String(f.url_fuente)} · capturado ${String(f.captured_at ?? "").slice(0, 10)}` +
    ` · tier ${String(f.tier)}`
  );
}

export function camposFicha(f: Record<string, unknown>): string {
  const lineas: string[] = [];
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === "") continue;
    if (k === "id") continue;
    const texto = Array.isArray(v) ? v.join(", ") : String(v);
    lineas.push(`${k}: ${texto}`);
  }
  return lineas.join("\n");
}

export async function correrBusqueda(params: ParamsFiltro): Promise<{
  filas: readonly Record<string, unknown>[];
  hayMas: boolean;
  aviso: string | null;
  sinSemantica: string | null;
  error: string | null;
}> {
  const f = parsearFiltros(params);
  if (f.consulta === "") {
    return {
      filas: [],
      hayMas: false,
      aviso: "Escribe una consulta (Enter busca).",
      sinSemantica: null,
      error: null,
    };
  }
  try {
    const { vector, motivo } = await embeberConsulta(f.consulta);
    const { comision: _c, ...op } = f.opciones;
    const r = await buscar(consultanteDesdeEntorno(), f.consulta, "api_bloque", f.limite, {
      ...op,
      embedding: vector,
    });
    const aviso = [advertenciaFiltros(f.opciones), r.advertencia].filter(Boolean).join(" ") || null;
    return {
      filas: r.filas,
      hayMas: r.hay_mas,
      aviso,
      sinSemantica: motivo,
      error: null,
    };
  } catch (e) {
    return {
      filas: [],
      hayMas: false,
      aviso: null,
      sinSemantica: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function correrFicha(fila: Record<string, unknown>): Promise<string> {
  const origen = String(fila.origen);
  const id = String(fila.id);
  const db = consultanteDesdeEntorno();
  if (origen === "norma") {
    const idn = identidadNorma(origen, fila.referencia);
    if (!idn) return "Sin identidad de norma para consultar vigencia.";
    const r = await vigencia(db, idn, "ficha_individual");
    if (r.filas.length === 0) return r.advertencia ?? "Sin afectaciones capturadas.";
    return r.filas
      .map(
        (x) =>
          `${String(x.veredicto)}\n` +
          `artículo: ${String(x.articulo)} · por: ${String(x.norma_afectante)}\n` +
          `cláusula: ${String(x.clausula_prueba)}\n` +
          `${String(x.procedencia)} · ${String(x.verificable_en)}`,
      )
      .join("\n\n");
  }
  if (origen === "proyecto_ley") {
    const r = await fichaProyecto(db, id, "ficha_individual");
    const ficha = r.filas[0];
    return ficha ? camposFicha(ficha) : (r.advertencia ?? "No encontrado.");
  }
  if (origen === "providencia") {
    const r = await fichaProvidencia(db, id, "ficha_individual");
    const ficha = r.filas[0];
    return ficha ? camposFicha(ficha) : (r.advertencia ?? "No encontrado.");
  }
  return camposFicha(fila);
}
