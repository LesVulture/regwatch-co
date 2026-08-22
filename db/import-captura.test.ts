import { describe, expect, it } from "vitest";
import type { FilaCaptura } from "../collectors/src/captura/fila.ts";
import { generarSqlCaptura } from "./import-captura.ts";

const FILA: FilaCaptura = {
  sourceKey: "senado-pdly",
  url: "https://leyes.senado.gov.co/api/search_pdly.php",
  capturedAt: "2026-08-21T00:00:00.000Z",
  contentHash: "ab".repeat(32),
  contentType: "application/json",
  httpStatus: 200,
  byteLength: 1000,
  blobUri: null,
  gateOutcome: "ok",
  gateRegla: null,
};

describe("generarSqlCaptura", () => {
  it("no inventa blob_uri: el cuerpo no está en Postgres", () => {
    const sql = generarSqlCaptura([FILA])[0] as string;
    expect(sql).toMatch(/blob_uri/);
    expect(sql).toContain("NULL");
    expect(sql).not.toMatch(/r2:\/\//i);
    expect(sql).not.toMatch(/s3:\/\//i);
  });

  it("dedup por (url, content_hash) y refresca el gate, no el hash", () => {
    const sql = generarSqlCaptura([FILA])[0] as string;
    expect(sql).toContain("on conflict (url, content_hash) do update set");
    expect(sql).toContain("gate_outcome = excluded.gate_outcome");
    expect(sql).not.toContain("content_hash = excluded");
  });

  it("un bloqueo escribe la regla; un ok deja gate_regla NULL", () => {
    const ok = generarSqlCaptura([FILA])[0] as string;
    expect(ok).toMatch(/'ok',\s*NULL\)/);
    const bloqueada: FilaCaptura = {
      ...FILA,
      gateOutcome: "bloqueado",
      gateRegla: "tamano-bajo-minimo",
    };
    const sql = generarSqlCaptura([bloqueada])[0] as string;
    expect(sql).toContain("'bloqueado'");
    expect(sql).toContain("'tamano-bajo-minimo'");
  });

  it("sin filas no emite SQL vacío que alguien ejecute por error", () => {
    expect(generarSqlCaptura([])).toEqual([]);
  });
});
