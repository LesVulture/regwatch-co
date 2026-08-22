/**
 * Encender `hnsw.iterative_scan`, y COMPROBAR que prendió.
 *
 * §8.3 pide este parámetro «encendido» y la investigación de `research/`
 * explica por qué: una consulta vectorial CON filtro sobre un índice HNSW
 * devuelve menos filas que el LIMIT, en silencio, y el Q&A contesta con menos
 * evidencia de la que hay. Es el modo de fallo del piloto vertical.
 *
 * Medido contra la instancia el 2026-08-20, y las tres cosas importan:
 *
 * 1. **El valor por defecto es `off`.** El fallo que esto evita es el estado
 *    de fábrica, no un caso raro.
 * 2. **No se puede fijar en la definición de la función.** `create function …
 *    set hnsw.iterative_scan` da `42501 permission denied` en Supabase, con el
 *    módulo cargado y sin él. Y tampoco lo puede poner `consultas.ts`: esa
 *    capa habla por PostgREST, sin sesión SQL. El único caller de producción
 *    es una conexión postgres.js directa (`db/embed-chunks.ts`). Las consultas
 *    de la web y del MCP corren con el default (`off`).
 * 3. **Y aquí está la trampa:** antes de que pgvector cargue su librería en la
 *    sesión, `hnsw.iterative_scan` es un *placeholder* que acepta CUALQUIER
 *    cadena. Se comprobó poniéndole `esto_no_es_un_valor_valido`: lo aceptó y
 *    lo guardó. Al cargar el módulo, un valor válido se adopta y uno inválido
 *    **se descarta sin avisar**, volviendo a `off`. Una errata en el nombre o
 *    en el valor no falla: degrada.
 *
 * Por eso esto no es un `set` y ya. Es un `set` + comprobación.
 */

/** Único valor que se usa. `strict_order` cuesta más y no hace falta aquí. */
export const VALOR_ITERATIVE_SCAN = "relaxed_order";

/**
 * Operación vectorial trivial cuyo único fin es forzar la carga del módulo de
 * pgvector, para que el placeholder se convierta en el GUC de verdad.
 */
export const SQL_FORZAR_CARGA =
  "select ('[1,0,0]'::extensions.vector(3) " +
  "operator(extensions.<#>) '[1,0,0]'::extensions.vector(3)) as carga";

export const SQL_ACTIVAR = `set hnsw.iterative_scan = '${VALOR_ITERATIVE_SCAN}'`;

/** Lee el valor EFECTIVO, no el que creemos haber puesto. */
export const SQL_COMPROBAR = "select setting from pg_settings where name = 'hnsw.iterative_scan'";

/** Lo mínimo que hace falta: ejecutar SQL suelto y leer filas. */
export type EjecutorSql = (sql: string) => Promise<readonly Record<string, unknown>[]>;

/**
 * Enciende el escaneo iterativo en la sesión y verifica que quedó puesto.
 *
 * Lanza si no. No es celo: el fallo que esto previene es silencioso por
 * definición, así que una versión que «lo intenta» no sirve de nada — sería
 * exactamente igual de tranquilizadora estando rota.
 */
export async function activarEscaneoIterativo(ejecutar: EjecutorSql): Promise<void> {
  await ejecutar(SQL_ACTIVAR);
  // El orden importa: sin esto, lo de arriba pudo haber escrito un placeholder.
  await ejecutar(SQL_FORZAR_CARGA);

  const filas = await ejecutar(SQL_COMPROBAR);

  if (filas.length === 0) {
    throw new Error(
      "hnsw.iterative_scan no aparece en pg_settings: el módulo de pgvector no " +
        "llegó a cargarse, así que lo que se fijó fue un placeholder sin efecto.",
    );
  }

  const efectivo = filas[0]?.setting;
  if (efectivo !== VALOR_ITERATIVE_SCAN) {
    throw new Error(
      `hnsw.iterative_scan quedó en '${String(efectivo)}' y no en ` +
        `'${VALOR_ITERATIVE_SCAN}'. Con 'off', una consulta vectorial filtrada ` +
        "devuelve menos filas que el LIMIT sin decirlo.",
    );
  }
}
