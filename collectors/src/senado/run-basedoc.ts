/**
 * Recolección basedoc: leads (hechos) + cruce con el articulado de cada
 * afectante. El camino 1616 ← 2460 deja de ser un one-off.
 *
 * fetch HTML + JS compañero → gate 0 del HTML → parseBasedoc → para cada
 * afectante distinta, recolectarArticulado → cerrarLeads → artefacto.
 *
 * El JS NO se guarda: lleva la prosa de Avance Jurídico. Se hashea y se
 * registra en `captura` (meta + hash, blob_uri NULL). Los leads son hechos.
 *
 * Uso:
 *   node collectors/src/senado/run-basedoc.ts Ley 1616 2013
 */

import { mkdir, writeFile } from "node:fs/promises";
import { g0Contrato } from "../gates/g0-contrato.ts";
import { depsPorDefecto, type HttpDeps, pedir } from "../http.ts";
import { recolectarArticulado, slugBasedoc } from "../rag/run-articulado.ts";
import { BASE, type BasedocParse, parseBasedoc } from "./basedoc.ts";
import {
  type AfectacionCandidata,
  type ArticuladoAfectante,
  cerrarLeads,
  claveNorma,
  type ResultadoCierre,
} from "./cerrar-leads.ts";

export interface ArtefactoBasedoc {
  readonly _procedencia: {
    readonly generado: string;
    readonly fuente: "senado-basedoc";
    readonly urlHtml: string;
    readonly urlJs: string;
    readonly html: {
      readonly contentHash: string;
      readonly contentType: string | null;
      readonly httpStatus: number;
      readonly bytes: number;
      readonly capturedAt: string;
    };
    readonly js: {
      readonly contentHash: string;
      readonly contentType: string | null;
      readonly httpStatus: number;
      readonly bytes: number;
      readonly capturedAt: string;
    } | null;
  };
  readonly norma: { readonly tipo: string; readonly numero: string; readonly anio: number };
  readonly gate: ReturnType<typeof g0Contrato>;
  readonly parse: BasedocParse | null;
  readonly cierre: ResultadoCierre | null;
}

function decodeIso(body: Uint8Array): string {
  return new TextDecoder("iso-8859-1").decode(body);
}

export async function recolectarBasedoc(
  tipo: string,
  numero: string,
  anio: number,
  deps: HttpDeps = depsPorDefecto,
): Promise<{
  basedoc: ArtefactoBasedoc;
  afectantes: Awaited<ReturnType<typeof recolectarArticulado>>[];
}> {
  const slug = slugBasedoc(tipo, numero, anio);
  const urlHtml = `${BASE}/${slug}.html`;
  const urlJs = `${BASE}/js/${slug}.js`;

  const htmlP = await pedir({ sourceKey: "senado-basedoc", url: urlHtml }, deps);
  const gate = g0Contrato(htmlP.capture, htmlP.body);

  const procedenciaHtml = {
    contentHash: htmlP.capture.contentHash,
    contentType: htmlP.capture.contentType,
    httpStatus: htmlP.capture.httpStatus,
    bytes: htmlP.capture.byteLength,
    capturedAt: htmlP.capture.capturedAt,
  };

  const baseArt: ArtefactoBasedoc = {
    _procedencia: {
      generado: htmlP.capture.capturedAt,
      fuente: "senado-basedoc",
      urlHtml,
      urlJs,
      html: procedenciaHtml,
      js: null,
    },
    norma: { tipo, numero, anio },
    gate,
    parse: null,
    cierre: null,
  };

  if (gate.outcome === "bloqueado") {
    return { basedoc: baseArt, afectantes: [] };
  }

  await deps.sleep(2_000);
  let jsBody = "";
  let jsProc: ArtefactoBasedoc["_procedencia"]["js"] = null;
  try {
    const jsP = await pedir({ sourceKey: "senado-basedoc", url: urlJs }, deps);
    jsBody = decodeIso(jsP.body);
    jsProc = {
      contentHash: jsP.capture.contentHash,
      contentType: jsP.capture.contentType,
      httpStatus: jsP.capture.httpStatus,
      bytes: jsP.capture.byteLength,
      capturedAt: jsP.capture.capturedAt,
    };
  } catch {
    // Sin JS las cajas salen vacías y parseBasedoc lo declara: cajasEnJs 0.
  }

  const parse = parseBasedoc(slug, decodeIso(htmlP.body), jsBody);
  const afectadasIdent = { tipo, numero, anio };

  const unicas = new Map<string, (typeof parse.leads)[number]["afectante"]>();
  for (const l of parse.leads) {
    if (/sentencia/i.test(l.afectante.tipo)) continue;
    unicas.set(claveNorma(l.afectante), l.afectante);
  }

  const afectantesArt = [];
  const mapa = new Map<string, ArticuladoAfectante>();
  for (const [i, af] of [...unicas.values()].entries()) {
    if (i > 0 || jsProc) await deps.sleep(2_000);
    const art = await recolectarArticulado(af.tipo, af.numero, Number(af.anio), deps);
    afectantesArt.push(art);
    if (art.gate.outcome !== "ok" || art.chunks.length === 0) continue;
    mapa.set(claveNorma(af), {
      identidad: { tipo: af.tipo, numero: af.numero, anio: Number(af.anio) },
      articulos: art.chunks.map((c) => {
        const des = c.id.split(":art:")[1] ?? "";
        const numeroArt = Number.parseInt(des, 10);
        const sufijo = des.replace(/^\d+/, "");
        return {
          numero: Number.isFinite(numeroArt) ? numeroArt : 0,
          sufijo,
          designacion: des || "0",
          encabezado: `ARTÍCULO ${des.toUpperCase()}.`,
          texto: c.texto,
        };
      }),
      urlFuente: art._procedencia.url,
      capturedAt: art._procedencia.generado,
    });
  }

  const cierre = cerrarLeads(afectadasIdent, parse.leads, mapa);

  return {
    basedoc: {
      ...baseArt,
      _procedencia: { ...baseArt._procedencia, js: jsProc },
      parse,
      cierre,
    },
    afectantes: afectantesArt,
  };
}

export function codigoSalidaBasedoc(art: ArtefactoBasedoc): number {
  if (art.gate.outcome === "bloqueado") return 1;
  return 0;
}

async function main(): Promise<void> {
  const [tipo, numero, anio] = process.argv.slice(2);
  if (!tipo || !numero || !anio) {
    console.error("uso: node collectors/src/senado/run-basedoc.ts <tipo> <numero> <anio>");
    console.error("ej:  node collectors/src/senado/run-basedoc.ts Ley 1616 2013");
    process.exitCode = 1;
    return;
  }

  const { basedoc, afectantes } = await recolectarBasedoc(tipo, numero, Number(anio));
  await mkdir("artefactos", { recursive: true });
  const slug = slugBasedoc(tipo, numero, anio);
  const destino = `artefactos/basedoc-${slug}.json`;
  await writeFile(destino, `${JSON.stringify(basedoc, null, 1)}\n`);

  const candidatas: AfectacionCandidata[] = basedoc.cierre?.candidatas.slice() ?? [];
  await writeFile(
    `artefactos/afectaciones-${slug}.json`,
    `${JSON.stringify(
      {
        _procedencia: {
          generado: basedoc._procedencia.generado,
          fuente: "cerrar-leads",
          basedoc: destino,
          nota: "Candidatas desde cláusula de la AFECTANTE. No hay prosa de Avance Jurídico.",
        },
        afectada: basedoc.norma,
        candidatas,
        huecos:
          basedoc.cierre?.huecos.map((h) => ({
            afectante: h.lead.afectante,
            motivo: h.motivo,
          })) ?? [],
      },
      null,
      1,
    )}\n`,
  );

  for (const a of afectantes) {
    const s = slugBasedoc(a.norma.tipo, a.norma.numero, a.norma.anio);
    await writeFile(`artefactos/articulado-${s}.json`, `${JSON.stringify(a, null, 1)}\n`);
  }

  console.log(`fuente   : ${basedoc._procedencia.urlHtml}`);
  console.log(`gate     : ${basedoc.gate.outcome}`);
  console.log(`leads    : ${basedoc.parse?.leads.length ?? 0}`);
  console.log(`cerradas : ${candidatas.length}`);
  console.log(`huecos   : ${basedoc.cierre?.huecos.length ?? 0}`);
  console.log(`artefacto: ${destino}`);
  process.exitCode = codigoSalidaBasedoc(basedoc);
}

if (process.argv[1]?.endsWith("run-basedoc.ts")) await main();
