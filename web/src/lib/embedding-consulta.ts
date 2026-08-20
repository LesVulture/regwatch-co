/**
 * Embebe la consulta del usuario para la mitad semántica de `hybrid_search`.
 *
 * `hybrid_search` recibe el vector como PARÁMETRO, así que embeber la consulta
 * es trabajo de esta capa, en cada petición. Con el modelo local eso tiene una
 * consecuencia de alcance que no es un detalle de implementación:
 *
 * **la búsqueda semántica funciona donde corre Ollama.** En `pnpm web:dev`, en
 * la máquina del usuario, funciona. En un despliegue público sin Ollama
 * accesible, NO — y entonces esto devuelve `vector: null` con su motivo, y
 * `hybrid_search` degrada exactamente a la búsqueda léxica. Eso está probado en
 * `db/schemas/08_rag.sql` y es un camino legítimo, no una avería. Lo que no es
 * legítimo es que el usuario no se entere: por eso se devuelve `motivo` y la
 * página lo enseña.
 *
 * **Nunca lanza.** Un Ollama caído no puede tumbar la búsqueda léxica, que es
 * la que sostiene el producto.
 */

import { embeberLote } from "../../../collectors/src/rag/embeddings.ts";

/** Cuánto se espera a Ollama antes de seguir sin vector. */
const TIMEOUT_MS = 4_000;

export interface EmbeddingConsulta {
  /** 256 dims re-normalizadas, o `null` si no se pudo embeber. */
  readonly vector: readonly number[] | null;
  /** Por qué no hay vector. `null` cuando sí lo hay. */
  readonly motivo: string | null;
}

/**
 * `fetch` se inyecta, igual que en `embeberLote`. No es comodidad de test: es lo
 * que permite comprobar el camino DEGRADADO —Ollama caído, respuesta rara,
 * timeout— sin depender de que Ollama esté vivo, y ese camino es justo el que
 * tiene que estar probado, porque es el que se ejecuta en producción sin él.
 */
export interface DepsEmbeddingConsulta {
  readonly fetch?: typeof globalThis.fetch;
}

export async function embeberConsulta(
  consulta: string,
  deps: DepsEmbeddingConsulta = {},
): Promise<EmbeddingConsulta> {
  const texto = consulta.trim();
  if (texto === "") return { vector: null, motivo: "consulta vacía" };

  try {
    // El timeout va en el `fetch` inyectado, no en el adaptador: quién puede
    // esperar y cuánto es una decisión de la capa que sirve la petición.
    const base = deps.fetch ?? fetch;
    const conTimeout: typeof globalThis.fetch = (input, init) =>
      base(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

    const [r] = await embeberLote([{ id: "consulta", texto }], "query", { fetch: conTimeout });
    if (!r) return { vector: null, motivo: "Ollama no devolvió vector para la consulta" };
    return { vector: r.vector, motivo: null };
  } catch (e) {
    return {
      vector: null,
      motivo: `sin búsqueda semántica (${(e as Error).message.slice(0, 120)})`,
    };
  }
}
