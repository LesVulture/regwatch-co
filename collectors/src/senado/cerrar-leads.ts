/**
 * Cruce lead → cláusula: el paso que convierte un puntero de basedoc en una
 * fila de `afectacion` defendible.
 *
 * `basedoc.ts` extrae HECHOS (qué norma, qué artículo, qué Diario Oficial),
 * nunca la prosa de Avance Jurídico. Este módulo no reintroduce esa prosa:
 * va al articulado de la norma AFECTANTE —texto oficial, art. 41 de la Ley 23
 * de 1982— y copia la cláusula donde ELLA declara el cambio.
 *
 * Sin este cruce, la vigencia saldría de un tercero. Con él, `derivation =
 * 'declarado_en_norma'` y `tier = 'primaria'` cumplen
 * `afectacion_vigencia_exige_primaria`. Un lead sin cláusula que lo sostenga
 * NO se inventa como arista: queda como hueco, que es la respuesta honesta.
 *
 * El camino 1616 ← 2460 deja de ser un one-off: esto es la función que lo
 * repite para cualquier norma ya cargada.
 */

import {
  type Articulo,
  clausulaDeAfectacion,
  clausulaVigencia,
  reglaEsDeterminista,
} from "./articulado.ts";
import type { Lead } from "./basedoc.ts";

export interface IdentidadNorma {
  readonly tipo: string;
  readonly numero: string;
  readonly anio: number;
}

export interface ArticuladoAfectante {
  readonly identidad: IdentidadNorma;
  readonly articulos: readonly Articulo[];
  readonly urlFuente: string;
  readonly capturedAt: string;
}

export interface AfectacionCandidata {
  readonly tipo: Lead["tipo"];
  /** Artículo de la norma AFECTADA. Null = la norma entera. */
  readonly articulo: string | null;
  readonly afectante: IdentidadNorma;
  readonly afectada: IdentidadNorma;
  readonly textoSoporte: string;
  readonly fechaEfecto: string | null;
  readonly fechaDerivation: "derivada_deterministicamente" | "no_determinable";
  readonly fechaRegla: string | null;
  readonly derivation: "declarado_en_norma";
  readonly urlFuente: string;
  readonly capturedAt: string;
  readonly tier: "primaria";
  readonly diarioOficial: string | null;
}

export interface ResultadoCierre {
  readonly candidatas: readonly AfectacionCandidata[];
  /**
   * Leads que no se pudieron cerrar, CON el motivo. Un conteo mudo no distingue
   * «no recolectamos la afectante» de «la afectante no declara lo que el lead
   * apuntaba».
   */
  readonly huecos: readonly { readonly lead: Lead; readonly motivo: string }[];
}

export function claveNorma(n: { tipo: string; numero: string; anio: string | number }): string {
  return `${normalizarTipo(n.tipo)}:${n.numero}:${Number(n.anio)}`;
}

export function normalizarTipo(tipo: string): string {
  return tipo.replace(/\s+/g, " ").trim().toLowerCase();
}

export function mismaNorma(
  a: { tipo: string; numero: string; anio: string | number },
  b: { tipo: string; numero: string; anio: string | number },
): boolean {
  return claveNorma(a) === claveNorma(b);
}

function identidad(n: { tipo: string; numero: string; anio: string | number }): IdentidadNorma {
  return { tipo: normalizarTipo(n.tipo), numero: n.numero, anio: Number(n.anio) };
}

function tipoDesdeVerbo(verbo: string): Lead["tipo"] | null {
  const n = verbo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (n.startsWith("modifi")) return "modifica";
  if (n.startsWith("adicio")) return "adiciona";
  if (n.startsWith("derog")) return "deroga_expresa";
  if (n.startsWith("sustit")) return "sustituye";
  if (n.startsWith("subrog")) return "subroga";
  if (n.startsWith("reglam")) return "reglamenta";
  if (n.startsWith("anul")) return "anula";
  return null;
}

/**
 * Cierra los leads contra el articulado de cada afectante.
 *
 * `afectantes` se indexa por `claveNorma`. Un lead cuya afectante no esté
 * aquí no se rellena: falta el texto primario, y sin él no hay arista.
 */
export function cerrarLeads(
  afectada: IdentidadNorma,
  leads: readonly Lead[],
  afectantes: ReadonlyMap<string, ArticuladoAfectante>,
): ResultadoCierre {
  const candidatas: AfectacionCandidata[] = [];
  const huecos: { lead: Lead; motivo: string }[] = [];
  const vistas = new Set<string>();

  for (const lead of leads) {
    const clave = claveNorma(lead.afectante);
    const art = afectantes.get(clave);
    if (!art) {
      huecos.push({
        lead,
        motivo: `no hay articulado de ${lead.afectante.tipo} ${lead.afectante.numero} de ${lead.afectante.anio}`,
      });
      continue;
    }

    const candidatosArts = art.articulos.filter((a) => {
      if (!lead.afectante.articulo) return true;
      return a.designacion.toLowerCase() === lead.afectante.articulo.toLowerCase();
    });
    const pool = candidatosArts.length > 0 ? candidatosArts : art.articulos;

    let clausula: ReturnType<typeof clausulaDeAfectacion> = null;
    for (const a of pool) {
      const c = clausulaDeAfectacion(a);
      if (c && mismaNorma(c.afectada, afectada)) {
        clausula = c;
        break;
      }
    }

    if (!clausula) {
      huecos.push({
        lead,
        motivo:
          `la ${art.identidad.tipo} ${art.identidad.numero} de ${art.identidad.anio} ` +
          "no declara en su articulado la afectación que el lead apuntaba",
      });
      continue;
    }

    const tipo = tipoDesdeVerbo(clausula.verbo) ?? lead.tipo;
    const articulo = clausula.articuloAfectado !== null ? String(clausula.articuloAfectado) : null;
    const dedup = `${clave}|${tipo}|${articulo ?? ""}|${clausula.textoSoporte}`;
    if (vistas.has(dedup)) continue;
    vistas.add(dedup);

    const regla = clausulaVigencia(art.articulos);
    const fechaDo = lead.fechaDiarioOficial;
    const determinista = reglaEsDeterminista(regla) && fechaDo !== null;
    const fechaRegla = determinista
      ? `${regla} Diario Oficial No. ${lead.diarioOficial ?? "?"} de ${fechaDo}.`
      : regla;

    candidatas.push({
      tipo,
      articulo,
      afectante: identidad(art.identidad),
      afectada: identidad(afectada),
      textoSoporte: clausula.textoSoporte,
      fechaEfecto: determinista ? fechaDo : null,
      fechaDerivation: determinista ? "derivada_deterministicamente" : "no_determinable",
      fechaRegla,
      derivation: "declarado_en_norma",
      urlFuente: art.urlFuente,
      capturedAt: art.capturedAt,
      tier: "primaria",
      diarioOficial: lead.diarioOficial,
    });
  }

  return { candidatas, huecos };
}
