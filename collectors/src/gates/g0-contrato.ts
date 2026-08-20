/**
 * g0 — La aduana. Valida los BYTES antes de parsear nada.
 *
 * Es la única barrera entre «la fuente respondió» y «la fuente respondió lo
 * que dijo que respondería». Cubre el modo de fallo #2, el éxito falso, que
 * es el más peligroso porque es indistinguible de un éxito para quien mira
 * el código HTTP.
 *
 * Caso que motiva este fichero, medido en campo: la API de la Corte
 * Constitucional con `maxprov=10001` devuelve **HTTP 200 con un fragmento
 * HTML de 2.882 bytes**, no JSON. Un ingestor que valide `status === 200`
 * registra cero resultados y no reporta ningún error.
 *
 * Coste: $0. Ningún LLM. Comparar un content-type con una constante y llamar
 * a JSON.parse no admite mejora por parte de un modelo de lenguaje.
 */

import type { RawCapture } from "../evidence.ts";
import { getSource, type SourceExpectation } from "../sources.ts";

export type GateOutcome = "ok" | "bloqueado";

export interface GateVerdict {
  readonly gate: string;
  readonly outcome: GateOutcome;
  readonly sourceKey: string;
  readonly url: string;
  /** Qué regla se violó. Vacío si `ok`. */
  readonly reglaViolada?: string;
  readonly esperado?: string;
  readonly observado?: string;
}

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

function startsWithBytes(body: Uint8Array, prefix: Uint8Array): boolean {
  if (body.length < prefix.length) return false;
  return prefix.every((b, i) => body[i] === b);
}

function fail(
  capture: RawCapture,
  reglaViolada: string,
  esperado: string,
  observado: string,
): GateVerdict {
  return {
    gate: "g0-contrato",
    outcome: "bloqueado",
    sourceKey: capture.sourceKey,
    url: capture.url,
    reglaViolada,
    esperado,
    observado,
  };
}

/**
 * Valida una captura contra las expectativas declaradas de su fuente.
 *
 * NUNCA valida el código HTTP como señal de éxito: un 200 no dice nada sobre
 * el cuerpo. El status solo se registra.
 */
export function g0Contrato(capture: RawCapture, body: Uint8Array): GateVerdict {
  let source: SourceExpectation;
  try {
    source = getSource(capture.sourceKey);
  } catch (e) {
    return fail(capture, "fuente-no-declarada", "una entrada en sources.ts", String(e));
  }

  // 1. Tamaño mínimo absoluto. Un soft-404 casi siempre es un cuerpo corto.
  if (capture.byteLength < source.minBytes) {
    return fail(
      capture,
      "tamano-bajo-minimo",
      `>= ${source.minBytes} bytes`,
      `${capture.byteLength} bytes`,
    );
  }

  // 2. Content-Type declarado. Se compara por prefijo: los servidores añaden charset.
  const ct = (capture.contentType ?? "").toLowerCase();
  if (!ct.startsWith(source.contentTypePrefix.toLowerCase())) {
    return fail(
      capture,
      "content-type",
      source.contentTypePrefix,
      capture.contentType ?? "(ninguno)",
    );
  }

  // 3. Marcadores de error medidos. Un JSON que empieza con <html es la Corte
  //    devolviendo su fragmento de error con status 200.
  if (source.errorMarkers?.length) {
    const head = new TextDecoder("utf-8", { fatal: false }).decode(body.subarray(0, 512));
    for (const marker of source.errorMarkers) {
      if (head.toLowerCase().includes(marker.toLowerCase())) {
        return fail(
          capture,
          "marcador-de-error",
          `sin "${marker}"`,
          `"${marker}" en los primeros 512 B`,
        );
      }
    }
  }

  // 4. El cuerpo parsea en el formato declarado. Esta es la comprobación que
  //    de verdad separa un éxito de un éxito falso.
  switch (source.bodyKind) {
    case "json": {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
      try {
        JSON.parse(text);
      } catch (e) {
        return fail(capture, "cuerpo-no-parsea", "JSON válido", `JSON.parse falló: ${String(e)}`);
      }
      break;
    }
    case "pdf": {
      if (!startsWithBytes(body, PDF_MAGIC)) {
        const head = new TextDecoder("utf-8", { fatal: false }).decode(body.subarray(0, 40));
        return fail(
          capture,
          "cuerpo-no-parsea",
          "magic bytes %PDF-",
          `empieza con: ${JSON.stringify(head)}`,
        );
      }
      break;
    }
    case "xml": {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(body.subarray(0, 2048));
      if (!/<\?xml|<rss|<feed/i.test(text)) {
        return fail(
          capture,
          "cuerpo-no-parsea",
          "declaración XML o raíz rss/feed",
          "ninguna en los primeros 2 KB",
        );
      }
      break;
    }
    case "html": {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(body.subarray(0, 2048));
      if (!/<html|<!doctype/i.test(text)) {
        return fail(
          capture,
          "cuerpo-no-parsea",
          "<html> o <!DOCTYPE>",
          "ninguno en los primeros 2 KB",
        );
      }
      break;
    }
  }

  // 5. Esquema forzado. La Secretaría del Senado solo responde por HTTP; una
  //    captura suya por HTTPS es un fallo de contrato, no algo que reintentar.
  if (source.httpOnly && capture.url.toLowerCase().startsWith("https://")) {
    return fail(capture, "esquema-forzado", "http:// (el 443 hace timeout)", capture.url);
  }

  return { gate: "g0-contrato", outcome: "ok", sourceKey: capture.sourceKey, url: capture.url };
}
