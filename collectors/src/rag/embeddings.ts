/**
 * Adaptador de embeddings (voyage-4).
 *
 * Lo único que necesita la clave es **la llamada**. La forma de la petición, el
 * troceado en lotes, la truncación Matryoshka y la re-normalización son lógica
 * pura, se pueden escribir hoy y se pueden probar sin gastar un token.
 *
 * ## La trampa que este módulo existe para no pisar
 *
 * voyage-4 es Matryoshka: se puede truncar de 2048 a 256 dimensiones quedándose
 * con el prefijo. Pero **truncar un vector normalizado lo desnormaliza** — la
 * norma del prefijo es menor que 1, y cuánto menor depende de cada texto.
 *
 * Eso importa porque la receta habitual de pgvector usa **producto interno**
 * (`vector_ip_ops`), que solo equivale al coseno **si los vectores están
 * normalizados**. Con vectores desnormalizados el producto interno premia a los
 * de norma grande: el ranking deja de medir parecido y empieza a medir longitud.
 * Y no falla — devuelve resultados, simplemente peores, en un orden que nadie
 * revisa.
 *
 * Las dos salidas honestas son re-normalizar al escribir o usar la opclass de
 * coseno. Aquí se re-normaliza, porque deja el índice utilizable con las dos.
 */

/** Dimensiones que el plan fija tras el análisis de §8.4. */
export const DIMS = 256;
export const MODELO = "voyage-4";
export const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

/**
 * Textos por petición. Voyage acepta lotes; el límite práctico lo marca el
 * total de tokens, no el número de textos.
 */
export const LOTE_MAX = 128;

export interface EntradaEmbedding {
  /** Identificador estable del chunk. Viaja para poder casar la respuesta. */
  readonly id: string;
  readonly texto: string;
}

export interface Embedding {
  readonly id: string;
  readonly vector: readonly number[];
}

/** Trocea respetando el límite por petición. */
export function lotes<T>(xs: readonly T[], tam: number = LOTE_MAX): T[][] {
  if (tam < 1) throw new Error(`tamaño de lote inválido: ${tam}`);
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += tam) out.push(xs.slice(i, i + tam));
  return out;
}

/**
 * Trunca a `dims` y **re-normaliza**.
 *
 * El orden importa: normalizar antes de truncar no sirve de nada, porque el
 * truncado es justo lo que rompe la norma.
 */
export function truncarYNormalizar(v: readonly number[], dims: number = DIMS): number[] {
  if (v.length < dims) {
    throw new Error(`el vector tiene ${v.length} dimensiones, menos que las ${dims} pedidas`);
  }
  const corte = v.slice(0, dims);
  const norma = Math.sqrt(corte.reduce((a, x) => a + x * x, 0));
  // Un vector nulo no se puede normalizar; devolverlo tal cual es preferible a
  // dividir por cero y propagar NaN por todo el índice.
  if (norma === 0) return corte;
  return corte.map((x) => x / norma);
}

/** ¿Está normalizado? Tolerancia laxa: es una comprobación, no una medición. */
export function estaNormalizado(v: readonly number[], tol = 1e-6): boolean {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return Math.abs(n - 1) <= tol;
}

/** Cuerpo de la petición. Sin red: solo la forma. */
export function cuerpoPeticion(textos: readonly string[], tipo: "document" | "query") {
  return {
    model: MODELO,
    input: textos,
    // `input_type` cambia el embedding: los corpus se embeben como `document` y
    // las consultas como `query`. Usar el mismo para los dos degrada el
    // ranking en silencio.
    input_type: tipo,
    output_dimension: DIMS,
  };
}

export interface EmbeddingDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly apiKey: string;
}

/**
 * Embebe un lote. La ÚNICA función que necesita la clave.
 *
 * Valida que la respuesta traiga tantos vectores como textos se enviaron: un
 * lote que vuelve incompleto emparejaría cada chunk con el vector del
 * siguiente, y eso no lanza — produce un índice que devuelve resultados
 * plausibles y equivocados.
 */
export async function embeberLote(
  entradas: readonly EntradaEmbedding[],
  tipo: "document" | "query",
  deps: EmbeddingDeps,
): Promise<Embedding[]> {
  if (entradas.length === 0) return [];
  if (entradas.length > LOTE_MAX) {
    throw new Error(`lote de ${entradas.length} textos; el máximo es ${LOTE_MAX}`);
  }

  const res = await deps.fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.apiKey}`,
    },
    body: JSON.stringify(
      cuerpoPeticion(
        entradas.map((e) => e.texto),
        tipo,
      ),
    ),
  });

  if (!res.ok) {
    throw new Error(`voyage devolvió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: { embedding?: number[]; index?: number }[] };
  const datos = json.data;
  if (!Array.isArray(datos)) {
    throw new Error(`respuesta inesperada de voyage: sin \`data\``);
  }

  // El emparejamiento silencioso es el fallo caro de esta capa.
  if (datos.length !== entradas.length) {
    throw new Error(
      `voyage devolvió ${datos.length} vectores para ${entradas.length} textos: ` +
        "el emparejamiento chunk↔vector sería incorrecto",
    );
  }

  return datos.map((d, i) => {
    // Se respeta el `index` que devuelve la API en vez de asumir el orden.
    const pos = typeof d.index === "number" ? d.index : i;
    const entrada = entradas[pos];
    if (!entrada) throw new Error(`voyage devolvió index ${pos}, fuera de rango`);
    if (!Array.isArray(d.embedding)) throw new Error(`vector ausente en la posición ${pos}`);
    return { id: entrada.id, vector: truncarYNormalizar(d.embedding) };
  });
}
