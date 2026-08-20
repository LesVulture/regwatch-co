/**
 * Recolección del articulado de UNA norma, de punta a punta.
 *
 * fetch → gate 0 → saneado editorial → chunks → **artefacto validado**.
 *
 * Sigue el patrón del resto de colectores y por el mismo motivo: nadie escribe
 * del scraper directo a la base. El artefacto es lo que permite mirar una
 * corrida —cuántos artículos salieron, si alguno se contaminó— antes de que
 * toque datos.
 *
 * Uso:
 *   node collectors/src/rag/run-articulado.ts Ley 1616 2013
 */

import { mkdir, writeFile } from "node:fs/promises";
import { g0Contrato } from "../gates/g0-contrato.ts";
import { depsPorDefecto, type HttpDeps, pedir } from "../http.ts";
import { BASE } from "../senado/basedoc.ts";
import { type Chunk, chunkNorma, estadisticas } from "./chunking.ts";

/** `Ley 1616 de 2013` → `ley_1616_2013`, que es como los nombra la fuente. */
export function slugBasedoc(tipo: string, numero: string, anio: string | number): string {
  return `${tipo.toLowerCase().replace(/\s+/g, "_")}_${numero}_${anio}`;
}

/**
 * Marcadores del aparato editorial de Avance Jurídico.
 *
 * No son para limpiar —de eso se encarga `soloArticulado()`— sino para
 * COMPROBAR que el saneado funcionó en esta corrida concreta. Si la fuente
 * cambia de marcado, el saneador dejará de morder y esto lo dirá en vez de
 * publicar en silencio texto que no es de dominio público.
 */
export const MARCADORES_EDITORIALES = [
  "Notas del Editor",
  "Notas de Vigencia",
  "Legislación Anterior",
  "Concordancias",
  "Avance Jurídico",
  "derecho de autor",
  "ISSN",
] as const;

export interface ArtefactoArticulado {
  readonly _procedencia: {
    readonly generado: string;
    readonly fuente: string;
    readonly url: string;
    readonly contentHash: string;
    readonly httpStatus: number;
    readonly bytes: number;
  };
  readonly norma: { readonly tipo: string; readonly numero: string; readonly anio: number };
  readonly gate: ReturnType<typeof g0Contrato>;
  readonly estadisticas: ReturnType<typeof estadisticas> | null;
  /** Chunks contaminados. Tiene que ser CERO para que esto se pueda cargar. */
  readonly contaminados: readonly string[];
  readonly chunks: readonly Chunk[];
}

export async function recolectarArticulado(
  tipo: string,
  numero: string,
  anio: number,
  deps: HttpDeps = depsPorDefecto,
): Promise<ArtefactoArticulado> {
  const url = `${BASE}/${slugBasedoc(tipo, numero, anio)}.html`;
  const { capture, body } = await pedir({ sourceKey: "senado-basedoc", url }, deps);
  const gate = g0Contrato(capture, body);

  const procedencia = {
    generado: capture.capturedAt,
    fuente: "senado-basedoc",
    url,
    contentHash: capture.contentHash,
    httpStatus: capture.httpStatus,
    bytes: capture.byteLength,
  };
  const norma = { tipo, numero, anio };

  // Una captura bloqueada NO se parsea, pero sí se registra: es el punto de
  // replay y la prueba de que la fuente se rompió.
  if (gate.outcome === "bloqueado") {
    return {
      _procedencia: procedencia,
      norma,
      gate,
      estadisticas: null,
      contaminados: [],
      chunks: [],
    };
  }

  // La fuente es ISO-8859-1 y está declarado en `sources.ts`. Decodificarla
  // como UTF-8 no falla: produce mojibake en cada tilde, en silencio.
  const html = new TextDecoder("iso-8859-1").decode(body);
  const chunks = chunkNorma(html, {
    tipo,
    numero,
    anio,
    urlFuente: url,
    capturedAt: capture.capturedAt,
  });

  const contaminados = chunks
    .filter((c) => MARCADORES_EDITORIALES.some((m) => c.texto.includes(m)))
    .map((c) => c.id);

  return {
    _procedencia: procedencia,
    norma,
    gate,
    estadisticas: estadisticas(chunks),
    contaminados,
    chunks,
  };
}

async function main(): Promise<void> {
  const [tipo, numero, anio] = process.argv.slice(2);
  if (!tipo || !numero || !anio) {
    console.error("uso: node collectors/src/rag/run-articulado.ts <tipo> <numero> <anio>");
    console.error("ej:  node collectors/src/rag/run-articulado.ts Ley 1616 2013");
    process.exitCode = 1;
    return;
  }

  const art = await recolectarArticulado(tipo, numero, Number(anio));
  const destino = `artefactos/articulado-${slugBasedoc(tipo, numero, anio)}.json`;
  await mkdir("artefactos", { recursive: true });
  await writeFile(destino, `${JSON.stringify(art, null, 1)}\n`);

  console.log(`fuente      : ${art._procedencia.url}`);
  console.log(`gate        : ${art.gate.outcome}`);
  console.log(`artículos   : ${art.chunks.length}`);
  if (art.estadisticas) {
    console.log(`caracteres  : medio ${art.estadisticas.caracteresMedios}`);
    if (art.estadisticas.idsDuplicados.length > 0) {
      console.log(`⚠ ids duplicados: ${art.estadisticas.idsDuplicados.join(", ")}`);
    }
  }
  console.log(`artefacto   : ${destino}`);

  if (art.contaminados.length > 0) {
    console.error(
      `\n⚠ ${art.contaminados.length} chunks con aparato editorial: ` +
        `${art.contaminados.join(", ")}\n` +
        "NO se puede cargar. El articulado es dominio público (art. 41 de la Ley 23 " +
        "de 1982); las notas del editor NO, y `chunk` es de lectura pública.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("run-articulado.ts")) await main();
