/**
 * Adaptador de embeddings (nomic-embed-text sobre Ollama local).
 *
 * ## Por qué no es voyage-4, que es lo que dice el plan
 *
 * El plan presupuestaba voyage-4 contando con sus 200M de tokens gratis para el
 * bootstrap; pasado ese bootstrap se factura, y la instrucción del dueño del
 * proyecto (2026-08-20) es que **no haya ninguna dependencia de pago**. Ollama
 * corre en la máquina, no cobra y no manda el corpus a un tercero. Lo que se
 * pierde con el cambio se dice abajo, en «Lo que cuesta».
 *
 * ## La trampa que este módulo existe para no pisar
 *
 * voyage-4 era Matryoshka: se podía truncar de 2048 a 256 dimensiones
 * quedándose con el prefijo. Pero **truncar un vector normalizado lo
 * desnormaliza** — la norma del prefijo es menor que 1, y cuánto menor depende
 * de cada texto.
 *
 * Eso importa porque la receta habitual de pgvector usa **producto interno**
 * (`vector_ip_ops`), que solo equivale al coseno **si los vectores están
 * normalizados**. Con vectores desnormalizados el producto interno premia a los
 * de norma grande: el ranking deja de medir parecido y empieza a medir
 * longitud. Y no falla — devuelve resultados, simplemente peores, en un orden
 * que nadie revisa.
 *
 * Aquí se re-normaliza tras truncar, igual que antes. `db/schemas/08_rag.sql`
 * declara `chunk_embedding_hnsw` con `vector_ip_ops` **porque** esto ocurre.
 *
 * ## Que el modelo local aguante el truncado NO se dio por supuesto: se midió
 *
 * De los dos modelos servidos en la máquina, uno soporta el truncado y el otro
 * no, y la diferencia es enorme. Fidelidad del ranking a 256 dims contra el
 * ranking del MISMO modelo a sus dimensiones nativas, sobre 217 textos reales
 * (los 37 artículos de la Ley 1616 de 2013 + 180 temas de providencias) y 8
 * consultas jurídicas, medido el 2026-08-20:
 *
 * | modelo           | nativas | recall@1 | recall@5 | spearman |
 * |------------------|---------|----------|----------|----------|
 * | nomic-embed-text | 768     | **0,75** | 0,725    | 0,879    |
 * | bge-m3           | 1024    | 0,25     | 0,700    | 0,833    |
 *
 * bge-m3 no está entrenado con Matryoshka y truncarlo le cambia el primer
 * resultado en 6 de cada 8 consultas — el fallo silencioso exacto que este
 * módulo persigue. Por eso el modelo es nomic-embed-text y no el que ya estaba
 * descargado. Se reproduce con `pnpm measure:matryoshka`; la interpretación y
 * los límites, en `docs/matryoshka-256.md`.
 *
 * **Lo que cuesta el cambio, dicho de frente:** recall@1 = 0,75 no es 1,0. El
 * truncado a 256 dims mueve el primer resultado en 2 de cada 8 consultas
 * respecto a las 768 dims del propio modelo. Se acepta porque las 256 dims son
 * un contrato con el esquema desplegado (§8.4: a 1024 dims cada vector supera
 * el umbral de TOAST) y porque el ranking semántico entra en RRF junto al
 * léxico, no como única señal. Subir a 768 es un re-embed y un cambio de
 * esquema, no una migración de arquitectura.
 *
 * ## El prefijo no es decoración
 *
 * nomic-embed-text se entrenó con prefijos de tarea: `search_document:` para el
 * corpus y `search_query:` para la consulta. Es el equivalente exacto del
 * `input_type` de Voyage, y omitirlo degrada el ranking sin dar ningún error.
 */

/** Dimensiones que el plan fija tras el análisis de §8.4. */
export const DIMS = 256;

/** El modelo local. Lo sirve Ollama; se descarga con `ollama pull nomic-embed-text`. */
export const MODELO = "nomic-embed-text";

/**
 * Dimensiones que el modelo devuelve ANTES de truncar. Se comprueba en cada
 * respuesta: si Ollama sirviera otro modelo bajo el mismo nombre, los vectores
 * dejarían de ser comparables con los ya escritos y nada fallaría.
 */
export const DIMS_NATIVAS = 768;

/**
 * Lo que se escribe en `chunk.modelo_embedding`. Lleva las dims a propósito:
 * comparar un vector de este modelo a 256 con uno del mismo modelo a 768 no da
 * error, da vecinos sin sentido.
 */
export const MODELO_ETIQUETA = `${MODELO}@${DIMS}`;

/** Ollama local. `OLLAMA_HOST` lo mueve; por defecto no sale de la máquina. */
export const ENDPOINT = `${process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"}/api/embed`;

/** Prefijos de tarea del modelo. Omitirlos degrada el ranking en silencio. */
export const PREFIJOS = {
  document: "search_document: ",
  query: "search_query: ",
} as const;

/**
 * Textos por petición. Ollama acepta lotes; el límite práctico aquí es la RAM
 * de la máquina, no una cuota.
 */
export const LOTE_MAX = 64;

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
    input: textos.map((t) => PREFIJOS[tipo] + t),
    // `truncate: false` es la línea que convierte un fallo silencioso en un
    // error. Ollama trunca por defecto lo que no cabe en el contexto (2.048
    // tokens): un artículo largo se embebería a medias y el vector saldría
    // plausible y equivocado, sin que nada lo dijera.
    truncate: false,
  };
}

export interface EmbeddingDeps {
  readonly fetch: typeof globalThis.fetch;
  /** Sobrescribible en test y para apuntar a otro Ollama. */
  readonly endpoint?: string;
}

/**
 * Embebe un lote. La ÚNICA función que toca la red.
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

  const res = await deps.fetch(deps.endpoint ?? ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      cuerpoPeticion(
        entradas.map((e) => e.texto),
        tipo,
      ),
    ),
  });

  if (!res.ok) {
    throw new Error(`ollama devolvió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as { embeddings?: number[][] };
  const datos = json.embeddings;
  if (!Array.isArray(datos)) {
    throw new Error("respuesta inesperada de ollama: sin `embeddings`");
  }

  // El emparejamiento silencioso es el fallo caro de esta capa. Ollama devuelve
  // los vectores EN ORDEN y sin `index`, así que la única defensa es el conteo.
  if (datos.length !== entradas.length) {
    throw new Error(
      `ollama devolvió ${datos.length} vectores para ${entradas.length} textos: ` +
        "el emparejamiento chunk↔vector sería incorrecto",
    );
  }

  return datos.map((vector, i) => {
    const entrada = entradas[i];
    if (!entrada) throw new Error(`vector sobrante en la posición ${i}`);
    if (!Array.isArray(vector)) throw new Error(`vector ausente en la posición ${i}`);
    if (vector.length !== DIMS_NATIVAS) {
      throw new Error(
        `ollama devolvió ${vector.length} dimensiones y ${MODELO} tiene ${DIMS_NATIVAS}: ` +
          "hay otro modelo detrás del mismo nombre y sus vectores no son comparables " +
          "con los ya escritos",
      );
    }
    return { id: entrada.id, vector: truncarYNormalizar(vector) };
  });
}
