/**
 * Proyección a `captura`: meta + hash, nunca el cuerpo ni un blob inventado.
 */

import { describe, expect, it } from "vitest";
import type { GateVerdict } from "../gates/g0-contrato.ts";
import type { ArtefactoArticulado } from "../rag/run-articulado.ts";
import type { ArtefactoBasedoc } from "../senado/run-basedoc.ts";
import { filasDesdeArticulado, filasDesdeBasedoc, filasDesdeCorridas } from "./desde-artefacto.ts";

const HASH = "ab".repeat(32);
const HASH_JS = "cd".repeat(32);

const gateOk: GateVerdict = {
  gate: "g0-contrato",
  outcome: "ok",
  sourceKey: "senado-basedoc",
  url: "http://www.secretariasenado.gov.co/senado/basedoc/ley_1616_2013.html",
};

describe("filasDesdeCorridas", () => {
  it("no inventa hash: una corrida vieja sin SHA-256 no entra por aquí", () => {
    const filas = filasDesdeCorridas(
      "senado-pdly",
      [
        {
          url: "https://leyes.senado.gov.co/api/search_pdly.php",
          contentHash: HASH,
          contentType: "application/json",
          httpStatus: 200,
          bytes: 1000,
          capturedAt: "2026-08-21T00:00:00.000Z",
          gate: {
            gate: "g0-contrato",
            outcome: "ok",
            sourceKey: "senado-pdly",
            url: "https://leyes.senado.gov.co/api/search_pdly.php",
          },
        },
      ],
      "https://leyes.senado.gov.co/api/search_pdly.php",
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]?.blobUri).toBeNull();
    expect(filas[0]?.contentHash).toBe(HASH);
  });
});

describe("filasDesdeBasedoc", () => {
  it("hashea HTML y JS; blob_uri NULL; el cuerpo del JS no viaja", () => {
    const art = {
      _procedencia: {
        generado: "2026-08-21T00:00:00.000Z",
        fuente: "senado-basedoc" as const,
        urlHtml: gateOk.url,
        urlJs: "http://www.secretariasenado.gov.co/senado/basedoc/js/ley_1616_2013.js",
        html: {
          contentHash: HASH,
          contentType: "text/html",
          httpStatus: 200,
          bytes: 80_000,
          capturedAt: "2026-08-21T00:00:00.000Z",
        },
        js: {
          contentHash: HASH_JS,
          contentType: "application/javascript",
          httpStatus: 200,
          bytes: 12_000,
          capturedAt: "2026-08-21T00:00:01.000Z",
        },
      },
      norma: { tipo: "Ley", numero: "1616", anio: 2013 },
      gate: gateOk,
      parse: null,
      cierre: null,
    } satisfies ArtefactoBasedoc;

    const filas = filasDesdeBasedoc(art);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.blobUri === null)).toBe(true);
    expect(filas.map((f) => f.contentHash)).toEqual([HASH, HASH_JS]);
    expect(JSON.stringify(filas)).not.toContain("insRow");
    expect(JSON.stringify(filas)).not.toContain("Avance Jurídico");
  });
});

describe("filasDesdeArticulado", () => {
  it("una fila por página, no un hash inventado del artefacto", () => {
    const art = {
      _procedencia: {
        generado: "2026-08-21T00:00:00.000Z",
        fuente: "senado-basedoc",
        url: gateOk.url,
        contentHash: HASH,
        httpStatus: 200,
        bytes: 80_000,
      },
      norma: { tipo: "Ley", numero: "1616", anio: 2013, titulo: "Salud mental" },
      gate: gateOk,
      estadisticas: null,
      contaminados: [],
      chunks: [],
      paginas: [
        {
          url: gateOk.url,
          contentHash: HASH,
          contentType: "text/html",
          httpStatus: 200,
          bytes: 80_000,
          capturedAt: "2026-08-21T00:00:00.000Z",
          gate: gateOk,
        },
      ],
      paginacionIncompleta: false,
      anomalias: [],
    } satisfies ArtefactoArticulado;

    const filas = filasDesdeArticulado(art);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.url).toBe(gateOk.url);
    expect(filas[0]?.blobUri).toBeNull();
  });
});
