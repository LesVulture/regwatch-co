/**
 * INSERT de `captura`. Puro: genera SQL, no se conecta.
 *
 * `blob_uri` va NULL en todas las filas. No hay R2; inventar una ruta
 * rompería el contrato de replay («el cuerpo está aquí») con un puntero
 * falso. El unique `(url, content_hash)` es la palanca de dedup: la misma
 * captura dos veces no se duplica.
 */

import type { FilaCaptura } from "../collectors/src/captura/fila.ts";

function lit(v: string | null): string {
  if (v === null) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

export function generarSqlCaptura(filas: readonly FilaCaptura[], tamLote = 200): string[] {
  if (filas.length === 0) return [];
  const lotes: string[] = [];
  for (let i = 0; i < filas.length; i += tamLote) {
    const values = filas
      .slice(i, i + tamLote)
      .map((f) =>
        [
          lit(f.sourceKey),
          lit(f.url),
          lit(f.capturedAt),
          lit(f.contentHash),
          lit(f.contentType),
          String(f.httpStatus),
          String(f.byteLength),
          "NULL",
          lit(f.gateOutcome),
          lit(f.gateRegla),
        ].join(", "),
      );
    lotes.push(
      "insert into captura (source_key, url, captured_at, content_hash, content_type,\n" +
        "                    http_status, byte_length, blob_uri, gate_outcome, gate_regla)\n" +
        "values\n  (" +
        values.join("),\n  (") +
        ")\n" +
        "on conflict (url, content_hash) do update set\n" +
        "  captured_at  = excluded.captured_at,\n" +
        "  gate_outcome = excluded.gate_outcome,\n" +
        "  gate_regla   = excluded.gate_regla;",
    );
  }
  return lotes;
}
