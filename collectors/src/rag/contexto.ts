/**
 * De la consulta al contexto citable.
 *
 * `hybrid_search` devuelve ENTIDADES; `construirBloques()` necesita CHUNKS.
 * Este módulo es el puente, y su parte interesante no es agrupar filas: es qué
 * hace cuando una norma relevante **no tiene texto ingerido**.
 *
 * La respuesta es que lo dice. `contexto_qa` devuelve esa entidad con
 * `chunk_id` NULL en vez de omitirla, y aquí eso se convierte en un hueco
 * explícito con su advertencia. Contestar sin mencionarlo sería responder con
 * menos evidencia de la que existe y presentarlo como si fuera toda —
 * exactamente el fallo que R7 prohíbe.
 */

import type { Chunk, FuenteChunk } from "./chunking.ts";

/** Lo mínimo que este módulo necesita de un cliente de base de datos. */
export interface ConsultanteContexto {
  rpc(nombre: string, args: Record<string, unknown>): Promise<{ filas: unknown[] }>;
}

/** Una fila cruda de `contexto_qa`. */
export interface FilaContexto {
  readonly posicion_entidad: number;
  readonly origen: FuenteChunk;
  readonly entidad_id: string;
  readonly entidad: string;
  readonly chunk_id: string | null;
  readonly referencia: string | null;
  readonly texto: string | null;
  readonly caracteres: number | null;
  readonly url_fuente: string;
  readonly captured_at: string;
  readonly tier: string;
}

/** Una entidad que casó con la consulta pero cuyo texto no está capturado. */
export interface HuecoEvidencia {
  readonly entidad: string;
  readonly origen: FuenteChunk;
  readonly urlFuente: string;
}

export interface Contexto {
  /** Listos para `construirBloques()`. */
  readonly chunks: readonly Chunk[];
  readonly huecos: readonly HuecoEvidencia[];
  /**
   * Chunks que EXISTEN pero cuyo texto la política de egreso no dejó salir.
   *
   * Va aparte de `huecos` a propósito: «no lo hemos capturado» y «no te lo
   * podemos enseñar» son cosas distintas, y colapsarlas dejaría una censura
   * disfrazada de laguna documental. Hoy está vacío —`normativo_oficial` sale
   * en los cuatro contextos— y existe para el día que no.
   */
  readonly redactados: readonly string[];
  /**
   * Qué hay que decirle al lector. `null` solo cuando no falta nada: si hay
   * huecos, esta frase acompaña a la respuesta, no al log.
   */
  readonly advertencia: string | null;
}

/**
 * Agrupa las filas de `contexto_qa` separando chunks de huecos.
 *
 * Función pura: se prueba sin base de datos, que es lo que permite comprobar
 * la política de huecos antes de que exista corpus.
 */
export function agruparContexto(filas: readonly FilaContexto[]): Contexto {
  const chunks: Chunk[] = [];
  const huecos: HuecoEvidencia[] = [];

  const redactados: string[] = [];

  for (const f of filas) {
    // Sin chunk: la entidad casó y su texto no está capturado. Hueco real.
    if (f.chunk_id === null) {
      huecos.push({ entidad: f.entidad, origen: f.origen, urlFuente: f.url_fuente });
      continue;
    }
    // CON chunk pero sin texto: el chunk existe y algo lo quitó por el camino
    // —la política de egreso—. No es una laguna del corpus.
    if (f.texto === null || f.texto === undefined) {
      redactados.push(f.chunk_id);
      continue;
    }
    chunks.push({
      id: f.chunk_id,
      fuente: f.origen,
      referencia: f.referencia ?? f.entidad,
      texto: f.texto,
      caracteres: f.caracteres ?? f.texto.length,
      urlFuente: f.url_fuente,
      capturedAt: f.captured_at,
    });
  }

  return { chunks, huecos, redactados, advertencia: advertenciaDe(chunks.length, huecos) };
}

function advertenciaDe(nChunks: number, huecos: readonly HuecoEvidencia[]): string | null {
  if (huecos.length === 0) return null;

  const lista = huecos.map((h) => h.entidad).join(", ");

  // El caso peor tiene su propia frase. «Faltan algunas» y «no hay ninguna» no
  // son el mismo aviso, y con corpus a medio ingerir el segundo es el habitual.
  if (nChunks === 0) {
    return (
      `Ninguna de las normas que coinciden con la consulta tiene su texto capturado ` +
      `todavía (${lista}). No se puede responder con citas: lo que hay son referencias, ` +
      `no articulado.`
    );
  }

  return (
    `Hay ${huecos.length} norma(s) relevantes cuyo texto NO está capturado (${lista}). ` +
    `La respuesta se apoya solo en lo que sí lo está, así que puede estar incompleta.`
  );
}

export interface OpcionesContexto {
  readonly embedding?: readonly number[] | null;
  readonly maxEntidades?: number;
  readonly maxChunksPorEntidad?: number;
  readonly pesoLexico?: number;
  readonly pesoSemantico?: number;
}

/** Recupera el contexto citable para una pregunta. */
export async function recuperarContexto(
  db: ConsultanteContexto,
  consulta: string,
  opciones: OpcionesContexto = {},
): Promise<Contexto> {
  const texto = consulta.trim();
  if (texto === "") {
    return { chunks: [], huecos: [], redactados: [], advertencia: "consulta vacía" };
  }

  const { filas } = await db.rpc("contexto_qa", {
    consulta: texto,
    consulta_embedding: opciones.embedding ? `[${opciones.embedding.join(",")}]` : null,
    ...(opciones.maxEntidades !== undefined ? { max_entidades: opciones.maxEntidades } : {}),
    ...(opciones.maxChunksPorEntidad !== undefined
      ? { max_chunks_por_entidad: opciones.maxChunksPorEntidad }
      : {}),
    ...(opciones.pesoLexico !== undefined ? { peso_lexico: opciones.pesoLexico } : {}),
    ...(opciones.pesoSemantico !== undefined ? { peso_semantico: opciones.pesoSemantico } : {}),
  });

  return agruparContexto(filas as FilaContexto[]);
}
