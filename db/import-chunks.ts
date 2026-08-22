/**
 * Genera el SQL que mete chunks en la tabla `chunk`.
 *
 * Existe porque la tabla no tenía escritor. `chunkNorma()` producía pasajes con
 * ids estables y nadie los persistía — el mismo contrato colgando que motivó
 * escribir `hybrid_search`, y esta vez introducido por el commit que creó la
 * tabla. Un productor sin consumidor es un defecto aunque las dos mitades estén
 * bien escritas.
 *
 * Puro a propósito, igual que `import-proyectos.ts`: genera texto, no se
 * conecta a nada. Así se prueba sin credenciales y el runner que sí las
 * necesita queda tonto.
 *
 * **Los chunks se insertan con `embedding = NULL`.** No es un apaño a la
 * espera de un proveedor de pago: es lo que la tabla declara legítimo. El
 * vector lo escribe después `db/embed-chunks.ts` contra Ollama local. Con el
 * vector ausente, `hybrid_search` NO los mira —su CTE semántico filtra por
 * `embedding is not null`— así que cargar texto **no cambia el ranking
 * semántico**, y decirlo importa. Lo que sí hace es materializar el corpus
 * citable que R2 necesita para validar (`validarCitas` compara contra los
 * chunks que existen).
 */

import type { Chunk } from "../collectors/src/rag/chunking.ts";

function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

/** A qué fila del corpus pertenece el lote. Una sola por llamada, y con id. */
export interface DestinoChunks {
  /** Cuál de las tres FKs se rellena. El CHECK del esquema exige coherencia. */
  readonly fuente: "norma" | "providencia" | "proyecto_ley";
  /** El uuid de la fila en `norma` / `providencia` / `proyecto_ley`. */
  readonly entidadId: string;
  /** Jerarquía probatoria de la captura. */
  readonly tier: "primaria" | "institucional" | "secundaria";
}

const COLUMNA_FK = {
  norma: "norma_id",
  providencia: "providencia_id",
  proyecto_ley: "proyecto_id",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Convierte chunks en sentencias INSERT, en lotes.
 *
 * Lanza en vez de generar SQL dudoso: un id duplicado dentro del mismo lote
 * haría fallar el INSERT entero a mitad de carga, y un uuid mal formado se
 * escaparía como texto hasta que Postgres lo rechazara con un error mucho
 * menos claro que este.
 */
export function generarSqlChunks(
  chunks: readonly Chunk[],
  destino: DestinoChunks,
  tamLote = 200,
): string[] {
  if (!UUID.test(destino.entidadId)) {
    throw new Error(`entidadId no es un uuid: ${destino.entidadId}`);
  }

  const vistos = new Set<string>();
  for (const c of chunks) {
    if (vistos.has(c.id)) {
      throw new Error(
        `id de chunk duplicado en el lote: ${c.id}. Dos artículos con el mismo ` +
          "id es una cita ambigua, que es peor que una que falta.",
      );
    }
    vistos.add(c.id);
    if (c.fuente !== destino.fuente) {
      throw new Error(
        `el chunk ${c.id} dice fuente '${c.fuente}' y el destino es '${destino.fuente}'`,
      );
    }
  }

  const fk = COLUMNA_FK[destino.fuente];
  const lotes: string[] = [];

  for (let i = 0; i < chunks.length; i += tamLote) {
    const filas = chunks
      .slice(i, i + tamLote)
      .map((c) =>
        [
          lit(c.id),
          lit(c.fuente),
          lit(destino.entidadId),
          lit(c.referencia),
          lit(c.texto),
          String(c.caracteres),
          lit(c.urlFuente),
          lit(c.capturedAt),
          lit(destino.tier),
        ].join(", "),
      );

    lotes.push(
      `insert into chunk (id, fuente, ${fk}, referencia, texto, caracteres,\n` +
        "                   url_fuente, captured_at, tier)\nvalues\n  (" +
        filas.join("),\n  (") +
        ")\n" +
        // Reingestar la misma norma no debe fallar ni duplicar. Se refresca el
        // texto y NO se toca el embedding: recalcularlo cuesta dinero y el
        // texto de un artículo que no cambió produce el mismo vector.
        "on conflict (id) do update set\n" +
        "  referencia  = excluded.referencia,\n" +
        "  texto       = excluded.texto,\n" +
        "  caracteres  = excluded.caracteres,\n" +
        "  url_fuente  = excluded.url_fuente,\n" +
        "  captured_at = excluded.captured_at,\n" +
        "  tier        = excluded.tier;",
    );
  }

  return lotes;
}
