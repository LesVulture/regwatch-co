/**
 * Proyecta artefactos de recolección a filas de `captura`.
 *
 * Los artefactos guardan meta + hash; el cuerpo no viaja. Esta capa no lo
 * inventa: `blob_uri` queda NULL.
 */

import type { GateVerdict } from "../gates/g0-contrato.ts";
import type { ArtefactoArticulado } from "../rag/run-articulado.ts";
import type { ArtefactoBasedoc } from "../senado/run-basedoc.ts";
import { type FilaCaptura, filaCaptura } from "./fila.ts";

interface CorridaCapturable {
  readonly url?: string;
  readonly contentHash: string;
  readonly contentType?: string | null;
  readonly httpStatus: number;
  readonly bytes: number;
  readonly capturedAt: string;
  readonly gate: GateVerdict;
}

export function filasDesdeCorridas(
  sourceKey: string,
  corridas: readonly CorridaCapturable[],
  urlPorDefecto: string,
): FilaCaptura[] {
  return corridas.map((c) =>
    filaCaptura(
      {
        sourceKey,
        url: c.url ?? c.gate.url ?? urlPorDefecto,
        capturedAt: c.capturedAt,
        contentHash: c.contentHash,
        contentType: c.contentType ?? null,
        httpStatus: c.httpStatus,
        byteLength: c.bytes,
      },
      c.gate,
    ),
  );
}

export function filasDesdeArticulado(art: ArtefactoArticulado): FilaCaptura[] {
  const paginas = art.paginas ?? [];
  if (paginas.length > 0) {
    return art.paginas.map((p) =>
      filaCaptura(
        {
          sourceKey: "senado-basedoc",
          url: p.url,
          capturedAt: p.capturedAt,
          contentHash: p.contentHash,
          contentType: p.contentType,
          httpStatus: p.httpStatus,
          byteLength: p.bytes,
        },
        p.gate,
      ),
    );
  }
  return [
    filaCaptura(
      {
        sourceKey: "senado-basedoc",
        url: art._procedencia.url,
        capturedAt: art._procedencia.generado,
        contentHash: art._procedencia.contentHash,
        contentType: null,
        httpStatus: art._procedencia.httpStatus,
        byteLength: art._procedencia.bytes,
      },
      art.gate,
    ),
  ];
}

export function filasDesdeBasedoc(art: ArtefactoBasedoc): FilaCaptura[] {
  const out: FilaCaptura[] = [
    filaCaptura(
      {
        sourceKey: "senado-basedoc",
        url: art._procedencia.urlHtml,
        capturedAt: art._procedencia.html.capturedAt,
        contentHash: art._procedencia.html.contentHash,
        contentType: art._procedencia.html.contentType,
        httpStatus: art._procedencia.html.httpStatus,
        byteLength: art._procedencia.html.bytes,
      },
      art.gate,
    ),
  ];
  const js = art._procedencia.js;
  if (js) {
    out.push(
      filaCaptura(
        {
          sourceKey: "senado-basedoc",
          url: art._procedencia.urlJs,
          capturedAt: js.capturedAt,
          contentHash: js.contentHash,
          contentType: js.contentType,
          httpStatus: js.httpStatus,
          byteLength: js.bytes,
        },
        {
          gate: "g0-contrato",
          outcome: "ok",
          sourceKey: "senado-basedoc",
          url: art._procedencia.urlJs,
        },
      ),
    );
  }
  return out;
}
