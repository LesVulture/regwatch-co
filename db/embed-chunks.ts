/**
 * Rellena `chunk.embedding` con vectores del modelo local.
 *
 * Es el UPDATE dirigido que `import-chunks.ts` dejó preparado al insertar los
 * chunks con `embedding = NULL`. Nada de reingesta: el texto ya está, lo que
 * falta es el vector.
 *
 * Requiere `SUPABASE_DB_URL` y un Ollama vivo con el modelo descargado
 * (`ollama pull nomic-embed-text`). Sin Ollama no degrada a nada peor: no
 * escribe, lo dice y sale en 1. `hybrid_search` sigue funcionando exactamente
 * igual con los vectores ausentes — degrada a la búsqueda léxica, que es el
 * camino de producción declarado en `db/schemas/08_rag.sql`.
 *
 * Uso:
 *   pnpm embed:chunks             # solo los que no tienen vector
 *   pnpm embed:chunks -- --todos  # re-embebe TODO (cambio de modelo)
 *   pnpm embed:chunks -- --dry-run
 */

import postgres from "postgres";
import {
  ENDPOINT,
  type EntradaEmbedding,
  embeberLote,
  LOTE_MAX,
  lotes,
  MODELO,
  MODELO_ETIQUETA,
} from "../collectors/src/rag/embeddings.ts";
import { activarEscaneoIterativo } from "../collectors/src/rag/escaneo-iterativo.ts";

const DRY = process.argv.includes("--dry-run");
const TODOS = process.argv.includes("--todos");

/**
 * Comprueba que Ollama esté vivo Y sirva el modelo. Las dos cosas: un Ollama
 * arrancado sin el modelo descargado responde a `/api/tags` y falla en la
 * primera petición de embeddings, a mitad de corrida.
 */
async function ollamaListo(): Promise<string | null> {
  const base = ENDPOINT.replace(/\/api\/embed$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5_000) });
  } catch (e) {
    return `no se pudo hablar con Ollama en ${base}: ${(e as Error).message}`;
  }
  if (!res.ok) return `Ollama en ${base} devolvió ${res.status}`;
  const j = (await res.json()) as { models?: { name?: string }[] };
  const nombres = (j.models ?? []).map((m) => m.name ?? "");
  if (!nombres.some((n) => n === MODELO || n.startsWith(`${MODELO}:`))) {
    return `Ollama está vivo pero no sirve ${MODELO}. Corre: ollama pull ${MODELO}`;
  }
  return null;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      "\nFalta SUPABASE_DB_URL.\n" +
        "Está en Supabase → Project Settings → Database → Connection string.\n" +
        "Ponla en .env (gitignored). NO la pegues en el repo ni en un commit.",
    );
    process.exitCode = 1;
    return;
  }

  const sql = postgres(url, { onnotice: () => {} });
  try {
    // SET + comprobación en UNA transacción (misma conexión). Tres `unsafe`
    // sueltos contra el pooler podrían SET en A y leer pg_settings en B, y
    // eso es un no-op silencioso — exactamente lo que el helper existe para
    // impedir. El GUC no afecta a estos UPDATE; se llama aquí porque es el
    // único caller de producción con postgres.js. PostgREST no puede SET:
    // web y MCP siguen en `off`. Un pooler en modo transacción que rechace
    // SET no tumba el embed.
    try {
      await sql.begin(async (tx) => {
        await activarEscaneoIterativo(async (q) => {
          const filas = await tx.unsafe(q);
          return filas as unknown as Record<string, unknown>[];
        });
      });
      console.log(
        "hnsw.iterative_scan = relaxed_order en postgres.js (esta sesión). " +
          "Las consultas de la web y del MCP van por PostgREST y siguen en off.",
      );
    } catch (e) {
      console.warn(
        `hnsw.iterative_scan no se pudo fijar (${(e as Error).message}). ` +
          "El embed continúa: escribir vectores no usa ese GUC.",
      );
    }

    const pendientes = await sql<{ id: string; texto: string; referencia: string }[]>`
      select id, texto, referencia from chunk
      ${TODOS ? sql`` : sql`where embedding is null`}
      order by id`;

    const total = await sql<{ n: number }[]>`select count(*)::int as n from chunk`;

    console.log(`modelo   : ${MODELO_ETIQUETA}`);
    console.log(`endpoint : ${ENDPOINT}`);
    console.log(`chunks   : ${total[0]?.n ?? 0} en la base`);
    console.log(`a embeber: ${pendientes.length}${TODOS ? " (--todos)" : " sin vector"}`);

    if (pendientes.length === 0) {
      console.log("\nNada que hacer.");
      return;
    }
    if (DRY) {
      console.log("\n--dry-run: no se llama a Ollama ni se escribe nada.");
      return;
    }

    const problema = await ollamaListo();
    if (problema) {
      console.error(`\n${problema}`);
      console.error(
        "No se escribe nada. Los chunks se quedan con `embedding = NULL`, que es un\n" +
          "estado legítimo: hybrid_search degrada a la búsqueda léxica sin error.",
      );
      process.exitCode = 1;
      return;
    }

    const entradas: EntradaEmbedding[] = pendientes.map((c) => ({
      // El texto se embebe CON su referencia delante. Es el «header contextual
      // determinista» de R4: `[Ley 1616 de 2013, art. 36]` sitúa el fragmento
      // sin generar contexto con un LLM, que es lo que §8.2 quería evitar.
      id: c.id,
      texto: `${c.referencia}\n\n${c.texto}`,
    }));

    let escritos = 0;
    const demasiadoLargos: { id: string; caracteres: number }[] = [];
    const t0 = Date.now();
    for (const [i, lote] of lotes(entradas, LOTE_MAX).entries()) {
      // Un lote puede caerse entero por UN chunk que no cabe en el contexto del
      // modelo (2.048 tokens). `truncate: false` hace que eso sea un error y no
      // un vector a medias —que es lo que se quiere—, pero entonces hay que
      // separar el grano: se reintenta uno a uno y el que no cabe se queda SIN
      // vector, declarado. Un chunk sin vector sigue siendo buscable
      // léxicamente; un chunk con un vector de la mitad de su texto es un
      // resultado plausible y equivocado.
      let vectores: Awaited<ReturnType<typeof embeberLote>>;
      try {
        vectores = await embeberLote(lote, "document", { fetch });
      } catch (e) {
        if (!/exceeds the context length/i.test((e as Error).message)) throw e;
        vectores = [];
        for (const entrada of lote) {
          try {
            vectores.push(...(await embeberLote([entrada], "document", { fetch })));
          } catch (e2) {
            if (!/exceeds the context length/i.test((e2 as Error).message)) throw e2;
            demasiadoLargos.push({ id: entrada.id, caracteres: entrada.texto.length });
          }
        }
      }
      // Una transacción por lote: si Ollama se cae a mitad, lo escrito hasta
      // ahí es correcto y volver a correr retoma por donde iba. Aquí «todo o
      // nada» sobraría — el estado parcial es declarable, porque un chunk o
      // tiene vector o no lo tiene.
      await sql.begin(async (tx) => {
        for (const v of vectores) {
          await tx`update chunk
                      set embedding = ${`[${v.vector.join(",")}]`}::extensions.vector(256),
                          modelo_embedding = ${MODELO_ETIQUETA}
                    where id = ${v.id}`;
        }
      });
      escritos += vectores.length;
      console.log(`  lote ${i + 1}: ${escritos}/${entradas.length}`);
    }

    const [restan] = await sql<
      { n: number }[]
    >`select count(*)::int as n from chunk where embedding is null`;
    console.log(
      `\n${escritos} vectores escritos en ${((Date.now() - t0) / 1000).toFixed(1)} s · ` +
        `${restan?.n ?? 0} chunk(s) siguen sin vector`,
    );

    if (demasiadoLargos.length > 0) {
      console.log(
        `\n${demasiadoLargos.length} chunk(s) NO caben en el contexto de ${MODELO} ` +
          "(2.048 tokens) y se quedan sin vector:",
      );
      for (const c of demasiadoLargos.slice(0, 15)) {
        console.log(`  · ${c.id} (${c.caracteres} caracteres)`);
      }
      if (demasiadoLargos.length > 15) {
        console.log(`  · … y ${demasiadoLargos.length - 15} más`);
      }
      console.log(
        "Siguen siendo buscables por texto y citables: lo único que les falta es la\n" +
          "mitad semántica. Un artículo tan largo suele ser además señal de que el\n" +
          "troceador no supo partirlo — mira `estadisticas.maximo` del artefacto.",
      );
      // No es un error: es una limitación declarada. El exit code queda en 0.
    }
  } finally {
    await sql.end();
  }
}

await main();
