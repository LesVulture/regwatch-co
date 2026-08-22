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
import { type Chunk, chunkNormaDePaginas, estadisticas } from "./chunking.ts";
import { extraerEpigrafe } from "./epigrafe.ts";

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
  readonly norma: {
    readonly tipo: string;
    readonly numero: string;
    readonly anio: number;
    /**
     * El EPÍGRAFE de la ley, que es su título oficial. `null` si no se pudo
     * extraer — y entonces `db/load-chunks.ts --crear-norma` se NIEGA a crear
     * la fila en vez de inventarse un título. Ver `epigrafe.ts`.
     */
    readonly titulo: string | null;
  };
  readonly gate: ReturnType<typeof g0Contrato>;
  readonly estadisticas: ReturnType<typeof estadisticas> | null;
  /** Chunks contaminados. Tiene que ser CERO para que esto se pueda cargar. */
  readonly contaminados: readonly string[];
  readonly chunks: readonly Chunk[];
  /** Una entrada por página basedoc (`_pr001.html`, …). Sirve para `captura`. */
  readonly paginas: readonly PaginaArticulado[];
  /**
   * `true` si había un «Siguiente» y esa página no se pudo recoger. Un
   * articulado a medias no se carga: parecería la ley entera.
   */
  readonly paginacionIncompleta: boolean;
  /**
   * Rarezas declaradas, no tragadas. Un ciclo antsig (Ley 1616, 2026-08-21:
   * página 1 ↔ `_pr001.html`) sale aquí en vez de pedir las mismas dos URLs
   * hasta `MAX_PAGINAS`. Evidencia: `docs/verificacion-viva-2026-08-21.md`.
   */
  readonly anomalias: readonly AnomaliaArticulado[];
}

/** Lo raro de la paginación basedoc. Se reporta; no se infiere una salida. */
export interface AnomaliaArticulado {
  readonly clase: "ciclo-paginacion";
  readonly detalle: string;
}

export interface PaginaArticulado {
  readonly url: string;
  readonly contentHash: string;
  readonly contentType: string | null;
  readonly httpStatus: number;
  readonly bytes: number;
  readonly capturedAt: string;
  readonly gate: ReturnType<typeof g0Contrato>;
}

/** Techo de páginas. Una ley basedoc no tiene 15; si las pide, algo cambió. */
const MAX_PAGINAS = 15;

/**
 * Sigue el ancla `antsig` de basedoc. HTTPS no se sigue: el 443 hace timeout
 * y g0 lo bloquearía igual. Relativo al URL actual, no al dominio a ojo.
 */
export function urlSiguientePagina(html: string, urlActual: string): string | null {
  const m =
    /<a[^>]*class=["']?antsig["']?[^>]*href=["']([^"'#]+)["']/i.exec(html) ??
    /<a[^>]*href=["']([^"'#]+)["'][^>]*class=["']?antsig["']/i.exec(html);
  const href = m?.[1];
  if (!href) return null;
  if (/^https:\/\//i.test(href)) return null;
  try {
    return new URL(href, urlActual).href;
  } catch {
    return null;
  }
}

export function codigoSalidaArticulado(art: ArtefactoArticulado): number {
  if (art.gate.outcome === "bloqueado") return 1;
  if (art.paginacionIncompleta) return 1;
  if (art.anomalias.some((a) => a.clase === "ciclo-paginacion")) return 1;
  if (art.contaminados.length > 0) return 1;
  if ((art.estadisticas?.idsDuplicados.length ?? 0) > 0) return 1;
  return 0;
}

function paginaDe(
  url: string,
  capture: {
    contentHash: string;
    contentType: string | null;
    httpStatus: number;
    byteLength: number;
    capturedAt: string;
  },
  gate: ReturnType<typeof g0Contrato>,
): PaginaArticulado {
  return {
    url,
    contentHash: capture.contentHash,
    contentType: capture.contentType,
    httpStatus: capture.httpStatus,
    bytes: capture.byteLength,
    capturedAt: capture.capturedAt,
    gate,
  };
}

export async function recolectarArticulado(
  tipo: string,
  numero: string,
  anio: number,
  deps: HttpDeps = depsPorDefecto,
): Promise<ArtefactoArticulado> {
  const urlInicial = `${BASE}/${slugBasedoc(tipo, numero, anio)}.html`;
  const norma = { tipo, numero, anio, titulo: null as string | null };
  const paginas: PaginaArticulado[] = [];
  const htmls: string[] = [];
  const vistas = new Set<string>();
  const anomalias: AnomaliaArticulado[] = [];
  let paginacionIncompleta = false;
  let url: string | null = urlInicial;

  while (url && paginas.length < MAX_PAGINAS) {
    if (vistas.has(url)) {
      // Medido 2026-08-21, Ley 1616: antsig de `_pr001` vuelve a la página 1.
      // Sin este corte se pedían 15 veces las mismas 2 URLs.
      anomalias.push({
        clase: "ciclo-paginacion",
        detalle: `antsig volvió a ${url}, ya pedida. Páginas únicas: ${paginas.length}.`,
      });
      break;
    }
    vistas.add(url);
    if (paginas.length > 0) await deps.sleep(2_000);
    const { capture, body } = await pedir({ sourceKey: "senado-basedoc", url }, deps);
    const gate = g0Contrato(capture, body);
    paginas.push(paginaDe(url, capture, gate));

    if (gate.outcome === "bloqueado") {
      if (paginas.length === 1) {
        return {
          _procedencia: {
            generado: capture.capturedAt,
            fuente: "senado-basedoc",
            url: urlInicial,
            contentHash: capture.contentHash,
            httpStatus: capture.httpStatus,
            bytes: capture.byteLength,
          },
          norma,
          gate,
          estadisticas: null,
          contaminados: [],
          chunks: [],
          paginas,
          paginacionIncompleta: false,
          anomalias,
        };
      }
      paginacionIncompleta = true;
      break;
    }

    const html = new TextDecoder("iso-8859-1").decode(body);
    htmls.push(html);
    url = urlSiguientePagina(html, url);
  }

  if (url && paginas.length >= MAX_PAGINAS) paginacionIncompleta = true;

  const primera = paginas[0];
  if (!primera) {
    throw new Error("recolectarArticulado: ninguna página pedida");
  }

  const titulo = htmls[0] ? extraerEpigrafe(htmls[0]) : null;
  const chunks = chunkNormaDePaginas(htmls, {
    tipo,
    numero,
    anio,
    urlFuente: urlInicial,
    capturedAt: primera.capturedAt,
  });
  const contaminados = chunks
    .filter((c) => MARCADORES_EDITORIALES.some((m) => c.texto.includes(m)))
    .map((c) => c.id);

  return {
    _procedencia: {
      generado: primera.capturedAt,
      fuente: "senado-basedoc",
      url: urlInicial,
      contentHash: primera.contentHash,
      httpStatus: primera.httpStatus,
      bytes: primera.bytes,
    },
    norma: { ...norma, titulo },
    gate: primera.gate,
    estadisticas: estadisticas(chunks),
    contaminados,
    chunks,
    paginas,
    paginacionIncompleta,
    anomalias,
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
  console.log(`título      : ${art.norma.titulo ?? "(no extraído — no se podrá crear la norma)"}`);
  console.log(`gate        : ${art.gate.outcome}`);
  console.log(
    `páginas     : ${art.paginas.length}${art.paginacionIncompleta ? " (incompleta)" : ""}`,
  );
  console.log(`artículos   : ${art.chunks.length}`);
  if (art.estadisticas) {
    console.log(`caracteres  : medio ${art.estadisticas.caracteresMedios}`);
    if (art.estadisticas.idsDuplicados.length > 0) {
      console.log(`⚠ ids duplicados: ${art.estadisticas.idsDuplicados.join(", ")}`);
    }
  }
  console.log(`artefacto   : ${destino}`);

  if (art.gate.outcome === "bloqueado") {
    console.error(
      `\n⚠ gate bloqueado: ${art.gate.reglaViolada}: esperado ${art.gate.esperado}, ` +
        `observado ${art.gate.observado}`,
    );
  }
  if (art.paginacionIncompleta) {
    console.error(
      "\n⚠ paginación incompleta: había continuación y no se recogió. NO se puede cargar.",
    );
  }
  for (const a of art.anomalias) {
    console.error(`\n⚠ ${a.clase}: ${a.detalle}`);
  }
  if (art.anomalias.some((a) => a.clase === "ciclo-paginacion")) {
    console.error("NO se puede cargar: el «Siguiente» cicla; no se certifica la ley entera.");
  }
  if (art.contaminados.length > 0) {
    console.error(
      `\n⚠ ${art.contaminados.length} chunks con aparato editorial: ` +
        `${art.contaminados.join(", ")}\n` +
        "NO se puede cargar. El articulado es dominio público (art. 41 de la Ley 23 " +
        "de 1982); las notas del editor NO, y `chunk` es de lectura pública.",
    );
  }
  process.exitCode = codigoSalidaArticulado(art);
}

if (process.argv[1]?.endsWith("run-articulado.ts")) await main();
