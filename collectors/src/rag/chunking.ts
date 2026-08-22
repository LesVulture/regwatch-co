/**
 * Chunking **por artículo**, que es la unidad jurídica citable.
 *
 * El plan lo dice y merece explicarse: cortar cada N tokens parte una norma por
 * la mitad y deja la obligación separada de su excepción, o el numeral separado
 * del artículo que lo condiciona. Un chunk así **recupera bien y responde mal**:
 * el buscador lo encuentra por similitud y el modelo redacta una obligación sin
 * la excepción que la limita. En un sistema jurídico eso no es un chunk peor,
 * es una respuesta falsa.
 *
 * Y hay una razón más, que es la que ata esto a R2: **el artículo es la unidad
 * que se puede CITAR**. «Ley 1616 de 2013, artículo 1» es una referencia que un
 * ciudadano puede verificar; «caracteres 4.200 a 4.700 del documento» no lo es.
 *
 * Este módulo no embebe nada. Produce los chunks y sus identificadores; la
 * vectorización es otro paso (`embeddings.ts` / `db/embed-chunks.ts`) y corre
 * contra nomic-embed-text en Ollama local. Sin Ollama el chunk se queda con
 * `embedding` NULL, que es un estado legítimo: `hybrid_search` degrada a léxico.
 */

import { partirArticulos, partirArticulosDePaginas } from "../senado/articulado.ts";

/** De dónde sale el chunk. Decide cómo se cita y con qué tier. */
export type FuenteChunk = "norma" | "providencia" | "proyecto_ley";

export interface Chunk {
  /**
   * Identificador **estable y legible**: `ley:1616:2013:art:1`.
   *
   * Estable porque R2 exige post-validar que cada cita resuelva a un chunk que
   * existe, y eso no funciona si el id cambia al reindexar. Legible porque un
   * id opaco convierte cada auditoría de una cita en una consulta a la base.
   */
  readonly id: string;
  readonly fuente: FuenteChunk;
  /** Referencia citable por un humano: «Ley 1616 de 2013, artículo 1». */
  readonly referencia: string;
  readonly texto: string;
  /** Caracteres. Sirve para presupuestar, no para cortar. */
  readonly caracteres: number;
  readonly urlFuente: string;
  readonly capturedAt: string;
}

export interface OpcionesChunk {
  readonly tipo: string;
  readonly numero: string;
  readonly anio: string | number;
  readonly urlFuente: string;
  readonly capturedAt: string;
}

/** Normaliza para el id: sin acentos, minúsculas, sin espacios. */
function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Parte una norma en chunks, uno por artículo.
 *
 * Un artículo largo NO se subdivide. Es deliberado: subdividirlo devolvería el
 * problema que el chunking por artículo resuelve. Si alguno no cabe en la
 * ventana del modelo, la respuesta correcta es recortar el CONTEXTO —traer
 * menos artículos— y no partir la unidad citable.
 */
export function chunkNorma(html: string, o: OpcionesChunk): Chunk[] {
  return chunkNormaDePaginas([html], o);
}

/**
 * Igual que `chunkNorma`, sobre páginas basedoc ya saneadas por separado.
 * Concatenar el HTML crudo tiraría todo lo que sigue al primer
 * `<!--Fin documento-->`.
 */
export function chunkNormaDePaginas(htmls: readonly string[], o: OpcionesChunk): Chunk[] {
  const base = `${slug(o.tipo)}:${slug(o.numero)}:${o.anio}`;
  const arts =
    htmls.length === 1 ? partirArticulos(htmls[0] as string) : partirArticulosDePaginas(htmls);
  return arts.map((a) => ({
    id: `${base}:art:${a.designacion.toLowerCase()}`,
    fuente: "norma" as const,
    referencia: `${o.tipo} ${o.numero} de ${o.anio}, artículo ${a.designacion}`,
    texto: a.texto,
    caracteres: a.texto.length,
    urlFuente: o.urlFuente,
    capturedAt: o.capturedAt,
  }));
}

/**
 * Estadísticas de un lote de chunks.
 *
 * §8.4 presupuesta ~176k chunks como techo provisional, y ese número salió de
 * una estimación, no de una medición. Esto es lo que permite sustituirlo por
 * una cifra real cuando haya corpus.
 */
export function estadisticas(chunks: readonly Chunk[]): {
  readonly total: number;
  readonly caracteresMedios: number;
  readonly maximo: number;
  readonly minimo: number;
  readonly idsDuplicados: readonly string[];
} {
  if (chunks.length === 0) {
    return { total: 0, caracteresMedios: 0, maximo: 0, minimo: 0, idsDuplicados: [] };
  }
  const largos = chunks.map((c) => c.caracteres);
  const vistos = new Set<string>();
  const dup = new Set<string>();
  for (const c of chunks) {
    if (vistos.has(c.id)) dup.add(c.id);
    vistos.add(c.id);
  }
  return {
    total: chunks.length,
    caracteresMedios: Math.round(largos.reduce((a, b) => a + b, 0) / chunks.length),
    maximo: Math.max(...largos),
    minimo: Math.min(...largos),
    idsDuplicados: [...dup],
  };
}
