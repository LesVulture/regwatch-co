import { describe, expect, it } from "vitest";
import type { RawCapture } from "../evidence.ts";
import type { GateVerdict } from "../gates/g0-contrato.ts";
import { filaCaptura } from "./fila.ts";

const HASH = "ab".repeat(32);

function capture(over: Partial<RawCapture> = {}): RawCapture {
  return {
    url: "https://leyes.senado.gov.co/api/search_pdly.php",
    capturedAt: "2026-08-21T00:00:00.000Z",
    contentHash: HASH,
    contentType: "application/json",
    httpStatus: 200,
    byteLength: 131_849,
    sourceKey: "senado-pdly",
    ...over,
  };
}

const ok: GateVerdict = {
  gate: "g0-contrato",
  outcome: "ok",
  sourceKey: "senado-pdly",
  url: "https://leyes.senado.gov.co/api/search_pdly.php",
};

describe("filaCaptura", () => {
  it("escribe meta + hash y deja blob_uri NULL", () => {
    const f = filaCaptura(capture(), ok);
    expect(f.blobUri).toBeNull();
    expect(f.contentHash).toBe(HASH);
    expect(f.gateOutcome).toBe("ok");
    expect(f.gateRegla).toBeNull();
  });

  /**
   * Una captura bloqueada SE CONSERVA: es el punto de replay. La CHECK
   * `captura_bloqueo_motivado` exige el motivo; sin él el INSERT cae.
   */
  it("un bloqueo lleva la regla que lo motivó", () => {
    const gate: GateVerdict = {
      ...ok,
      outcome: "bloqueado",
      reglaViolada: "tamano-bajo-minimo",
    };
    const f = filaCaptura(capture({ byteLength: 12 }), gate);
    expect(f.gateOutcome).toBe("bloqueado");
    expect(f.gateRegla).toBe("tamano-bajo-minimo");
  });

  it("rechaza un hash que la CHECK del esquema no aceptaría", () => {
    expect(() => filaCaptura(capture({ contentHash: "x".repeat(64) }), ok)).toThrow(/SHA-256/);
  });
});
