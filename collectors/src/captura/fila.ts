/**
 * Fila de `captura` lista para persistir: meta + hash, sin el cuerpo.
 *
 * El contrato (§7) pide bytes crudos ANTES del parseo. El cuerpo no vive en
 * Postgres (Free, ~500 MB) y no hay R2 todavía: `blob_uri` queda NULL. Lo que
 * sí se puede escribir hoy —y lo que este módulo produce— es la procedencia
 * de la petición: URL, hash, status, tamaño, veredicto del gate. Un NULL en
 * `blob_uri` es honesto; una ruta inventada no lo sería.
 *
 * No se afirma Storage. Quien cargue esta fila no tiene el objeto; tiene el
 * punto de replay (re-pedir esa URL) y la prueba de que esa captura existió.
 */

import type { RawCapture } from "../evidence.ts";
import type { GateVerdict } from "../gates/g0-contrato.ts";

export interface FilaCaptura {
  readonly sourceKey: string;
  readonly url: string;
  readonly capturedAt: string;
  readonly contentHash: string;
  readonly contentType: string | null;
  readonly httpStatus: number;
  readonly byteLength: number;
  /** Siempre null hasta que §13.6 decida destino. No se rellena a ojo. */
  readonly blobUri: null;
  readonly gateOutcome: "ok" | "bloqueado";
  readonly gateRegla: string | null;
}

const HASH_SHA256 = /^[0-9a-f]{64}$/;

/**
 * Arma la fila desde una captura y su gate. Lanza si el hash no es SHA-256:
 * la CHECK `captura_hash_sha256` lo rechazaría después, más lejos del origen.
 */
export function filaCaptura(capture: RawCapture, gate: GateVerdict): FilaCaptura {
  if (!HASH_SHA256.test(capture.contentHash)) {
    throw new Error(`contentHash no es SHA-256 hex: ${capture.contentHash.slice(0, 16)}…`);
  }
  const bloqueado = gate.outcome === "bloqueado";
  return {
    sourceKey: capture.sourceKey,
    url: capture.url,
    capturedAt: capture.capturedAt,
    contentHash: capture.contentHash,
    contentType: capture.contentType,
    httpStatus: capture.httpStatus,
    byteLength: capture.byteLength,
    blobUri: null,
    gateOutcome: gate.outcome,
    gateRegla: bloqueado ? (gate.reglaViolada ?? "sin-regla") : null,
  };
}
