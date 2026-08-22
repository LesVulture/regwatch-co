/**
 * Filtros de consulta compartidos por web, MCP y TUI.
 *
 * No es una taxonomía: cada valor o está en el esquema (enum, columna) o es
 * un atajo que rellena `q`. Un filtro que solo existe en `proyecto_ley`
 * excluye normas y providencias; eso se DECLARA, no se calla.
 */

import { ESTADOS_CANONICOS } from "../../../collectors/src/senado/estados.ts";
import type { OpcionesBusqueda } from "./consultas.ts";

export const ORIGENES = ["proyecto_ley", "providencia", "norma"] as const;
export type OrigenResultado = (typeof ORIGENES)[number];

export const CAMARAS = ["senado", "camara"] as const;
export type CamaraTramite = (typeof CAMARAS)[number];

export const TIPOS_PROVIDENCIA = [
  "Auto",
  "Tutela",
  "Constitucionalidad",
  "Sentencia de unificación",
  "desconocido",
] as const;

export const ESTADOS_TRAMITE = ESTADOS_CANONICOS;

/** Atajos de consulta. No son ids de tema: rellenan `q`. */
export const ATAJOS_CONSULTA = [
  { q: "salud mental", etiqueta: "Salud mental" },
  { q: "inteligencia artificial", etiqueta: "Inteligencia artificial" },
  { q: "infancia", etiqueta: "Infancia" },
  { q: "ambiente", etiqueta: "Ambiente" },
  { q: "trabajo", etiqueta: "Trabajo" },
  { q: "educación", etiqueta: "Educación" },
] as const;

const ORIGEN_SET = new Set<string>(ORIGENES);
const ESTADO_SET = new Set<string>(ESTADOS_CANONICOS);
const CAMARA_SET = new Set<string>(CAMARAS);
const TIPO_PROV_SET = new Set<string>(TIPOS_PROVIDENCIA);

export const LIMITE_DEFECTO = 20;

export interface ParamsFiltro {
  readonly q?: string;
  readonly tipo?: string;
  readonly legislatura?: string;
  readonly estado?: string;
  readonly camara?: string;
  readonly anio?: string;
  readonly tipo_providencia?: string;
  readonly comision?: string;
  readonly page?: string;
}

export interface FiltrosResueltos {
  readonly consulta: string;
  readonly opciones: OpcionesBusqueda;
  readonly page: number;
  readonly limite: number;
  readonly advertencia: string | null;
}

export function esOrigen(v: string): v is OrigenResultado {
  return ORIGEN_SET.has(v);
}

export function esEstadoTramite(v: string): boolean {
  return ESTADO_SET.has(v);
}

export function esCamara(v: string): v is CamaraTramite {
  return CAMARA_SET.has(v);
}

export function esTipoProvidencia(v: string): boolean {
  return TIPO_PROV_SET.has(v);
}

export function esUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function entero(v: string | undefined, min: number, max: number): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

/**
 * Aviso cuando un filtro de trámite deja fuera a normas/providencias, o cuando
 * se combina con un tipo al que no aplica.
 */
export function advertenciaFiltros(o: OpcionesBusqueda): string | null {
  const deProyecto =
    o.legislatura !== undefined || o.estado !== undefined || o.camara !== undefined;
  const deProv = o.tipoProvidencia !== undefined;
  if (!deProyecto && !deProv) return null;

  if (deProyecto && o.soloTipo === "providencia") {
    return (
      "legislatura, estado y cámara solo existen en proyectos de ley (fuente " +
      "Senado). Combinados con jurisprudencia no hay candidatos."
    );
  }
  if (deProyecto && o.soloTipo === "norma") {
    return (
      "legislatura, estado y cámara solo existen en proyectos de ley (fuente " +
      "Senado). Combinados con normas no hay candidatos."
    );
  }
  if (deProv && o.soloTipo === "proyecto_ley") {
    return "El tipo de providencia no aplica a proyectos de ley: no hay candidatos.";
  }
  if (deProv && o.soloTipo === "norma") {
    return "El tipo de providencia no aplica a normas: no hay candidatos.";
  }
  if (deProyecto && o.soloTipo === undefined) {
    return (
      "Este recorte solo existe en proyectos de ley del Senado (cámara del " +
      "trámite según esa fuente, no el corpus de la Cámara). Normas y " +
      "providencias no salen."
    );
  }
  if (deProv && o.soloTipo === undefined) {
    return "El tipo de providencia restringe a jurisprudencia; normas y proyectos no salen.";
  }
  return null;
}

export function parsearFiltros(
  params: ParamsFiltro,
  limite: number = LIMITE_DEFECTO,
): FiltrosResueltos {
  const page = entero(params.page, 1, 10_000) ?? 1;
  const leg = params.legislatura?.trim();
  const com = params.comision?.trim();
  const anio = entero(params.anio, 1810, 2100);
  const opciones: OpcionesBusqueda = {
    ...(params.tipo !== undefined && esOrigen(params.tipo) ? { soloTipo: params.tipo } : {}),
    ...(leg ? { legislatura: leg } : {}),
    ...(params.estado !== undefined && esEstadoTramite(params.estado)
      ? { estado: params.estado }
      : {}),
    ...(params.camara !== undefined && esCamara(params.camara) ? { camara: params.camara } : {}),
    ...(anio !== undefined ? { anio } : {}),
    ...(params.tipo_providencia !== undefined && esTipoProvidencia(params.tipo_providencia)
      ? { tipoProvidencia: params.tipo_providencia }
      : {}),
    ...(com ? { comision: com } : {}),
    ...(page > 1 ? { desplazamiento: (page - 1) * limite } : {}),
  };

  return {
    consulta: params.q?.trim() ?? "",
    opciones,
    page,
    limite,
    advertencia: advertenciaFiltros(opciones),
  };
}

export function etiquetaOrigen(origen: string): string {
  switch (origen) {
    case "proyecto_ley":
      return "Proyecto de ley";
    case "providencia":
      return "Jurisprudencia";
    case "norma":
      return "Norma";
    default:
      return origen;
  }
}

export function etiquetaEstado(estado: string): string {
  return estado.replaceAll("_", " ");
}

export function etiquetaCamara(camara: string): string {
  return camara === "camara" ? "Cámara (trámite, fuente Senado)" : "Senado (trámite)";
}

const CAMPOS_FILTRO = [
  "q",
  "tipo",
  "legislatura",
  "estado",
  "camara",
  "anio",
  "tipo_providencia",
  "comision",
  "page",
] as const satisfies readonly (keyof ParamsFiltro)[];

function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** `searchParams` de Next puede traer `string | string[]`. */
export function parsearSearchParams(
  sp: Record<string, string | string[] | undefined>,
  limite: number = LIMITE_DEFECTO,
): FiltrosResueltos {
  const q = uno(sp.q);
  const tipo = uno(sp.tipo);
  const legislatura = uno(sp.legislatura);
  const estado = uno(sp.estado);
  const camara = uno(sp.camara);
  const anio = uno(sp.anio);
  const tipoProv = uno(sp.tipo_providencia);
  const comision = uno(sp.comision);
  const page = uno(sp.page);
  return parsearFiltros(
    {
      ...(q !== undefined ? { q } : {}),
      ...(tipo !== undefined ? { tipo } : {}),
      ...(legislatura !== undefined ? { legislatura } : {}),
      ...(estado !== undefined ? { estado } : {}),
      ...(camara !== undefined ? { camara } : {}),
      ...(anio !== undefined ? { anio } : {}),
      ...(tipoProv !== undefined ? { tipo_providencia: tipoProv } : {}),
      ...(comision !== undefined ? { comision } : {}),
      ...(page !== undefined ? { page } : {}),
    },
    limite,
  );
}

export function queryDeSearch(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const u = new URLSearchParams();
  for (const k of CAMPOS_FILTRO) {
    const v = uno(sp[k])?.trim();
    if (v) u.set(k, v);
  }
  return u;
}

/**
 * `hybrid_search` no tiene predicado de comisión: recorta el listado, no el
 * FTS. Si la URL la trae junto a `q`, se DECLARA que no entra en la búsqueda.
 */
export function avisoComisionEnBusqueda(
  comision: string | undefined,
  hayConsulta: boolean,
): string | null {
  if (!hayConsulta || !comision) return null;
  return "La comisión solo recorta el listado de proyectos, no la búsqueda por texto.";
}
