/**
 * ¿Cuánto se rompe un modelo de embeddings al truncarlo a 256 dimensiones?
 *
 * El esquema declara `chunk.embedding` como `vector(256)`. Ese número venía de
 * voyage-4, que es Matryoshka por construcción; al sustituirlo por un modelo
 * local la propiedad DEJA DE ESTAR GARANTIZADA, y truncar un modelo que no la
 * tiene no falla: devuelve vecinos peores en un orden que nadie revisa.
 *
 * Esto es la medición que sostiene `docs/matryoshka-256.md`. Vivía como esbozo
 * dentro del propio documento —es decir, como una cifra en prosa que nadie
 * podía volver a calcular—, que es exactamente lo que este repositorio tiene
 * escrito que no vale. Ahora se corre:
 *
 *   ollama pull nomic-embed-text && ollama pull bge-m3
 *   pnpm measure:matryoshka
 *
 * Y escribe `artefactos/matryoshka-256.json` con las cifras y su procedencia.
 * Necesita los artefactos de articulado y de la relatoría en `artefactos/`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { ENDPOINT } from "./embeddings.ts";

/** Las dimensiones que declara el esquema, y por tanto lo que hay que medir. */
const DIMS = 256;

/**
 * Modelos a comparar, cada uno con SU convención de prefijos. Embeber una
 * consulta como documento degrada el ranking sin dar ningún error, así que
 * medir sin respetarlo mediría el descuido, no el truncado.
 */
const MODELOS = [
  { nombre: "nomic-embed-text", doc: "search_document: ", query: "search_query: " },
  { nombre: "bge-m3", doc: "", query: "" },
] as const;

/** Español jurídico, del dominio real del corpus. */
const CONSULTAS = [
  "atención en salud mental de niños y adolescentes",
  "tutela contra providencia judicial",
  "consulta previa a comunidades étnicas",
  "estabilidad laboral reforzada por fuero de salud",
  "protección de datos personales sensibles",
  "reparación integral a víctimas del conflicto",
  "mecanismos de participación ciudadana",
  "migración y estatuto de protección temporal",
];

interface Articulado {
  readonly chunks?: readonly { readonly texto?: string }[];
}
interface Relatoria {
  readonly providencias?: readonly { readonly tema?: string | null }[];
}

/** El corpus de la medición: textos REALES del proyecto, no frases de prueba. */
function corpus(): string[] {
  const art = JSON.parse(
    readFileSync("artefactos/articulado-ley_1616_2013.json", "utf-8"),
  ) as Articulado;
  const rel = JSON.parse(readFileSync("artefactos/corte-relatoria.json", "utf-8")) as Relatoria;

  const textos = (art.chunks ?? []).map((a) => a.texto ?? "").filter((t) => t.length > 40);
  if (textos.length === 0) {
    throw new Error(
      "el artefacto de articulado no aportó ni un texto: la medición mediría otra cosa",
    );
  }
  const temas = [
    ...new Set((rel.providencias ?? []).map((p) => p.tema ?? "").filter((t) => t.length > 40)),
  ].slice(0, 180);
  return [...textos, ...temas];
}

async function embeber(modelo: string, entradas: string[]): Promise<number[][]> {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `truncate: false` a propósito: con el defecto de Ollama un artículo largo
    // se embebería a medias y la medición saldría plausible y equivocada.
    body: JSON.stringify({ model: modelo, input: entradas, truncate: false }),
  });
  if (!r.ok) throw new Error(`${modelo}: HTTP ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { embeddings?: number[][] };
  if (!Array.isArray(j.embeddings)) throw new Error(`${modelo}: respuesta sin \`embeddings\``);
  if (j.embeddings.length !== entradas.length) {
    throw new Error(`${modelo}: ${j.embeddings.length} vectores para ${entradas.length} textos`);
  }
  return j.embeddings;
}

function normalizar(v: readonly number[]): number[] {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return n === 0 ? [...v] : v.map((x) => x / n);
}

/**
 * Truncar Y RE-NORMALIZAR. No es un detalle: el índice HNSW usa `vector_ip_ops`
 * (producto interno), que solo equivale al coseno con vectores de norma 1.
 * Medir sin re-normalizar daría un resultado peor por un motivo que no es el
 * del modelo.
 */
const truncar = (v: readonly number[]) => normalizar(v.slice(0, DIMS));

const punto = (a: readonly number[], b: readonly number[]) =>
  a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

const ranking = (q: readonly number[], docs: readonly number[][]) =>
  docs
    .map((d, i) => [i, punto(q, d)] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => i);

const recallEnK = (nativo: readonly number[], cortado: readonly number[], k: number) => {
  const top = new Set(nativo.slice(0, k));
  return cortado.slice(0, k).filter((i) => top.has(i)).length / k;
};

/** Spearman sobre el ranking completo: el orden general, no solo la cabeza. */
function spearman(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const posA = new Map(a.map((doc, i) => [doc, i]));
  const posB = new Map(b.map((doc, i) => [doc, i]));
  let suma = 0;
  for (const doc of a) {
    const d = (posA.get(doc) ?? 0) - (posB.get(doc) ?? 0);
    suma += d * d;
  }
  return 1 - (6 * suma) / (n * (n * n - 1));
}

async function main(): Promise<void> {
  const docs = corpus();
  console.log(`corpus: ${docs.length} textos reales · ${CONSULTAS.length} consultas\n`);

  const filas = [];
  for (const m of MODELOS) {
    const t0 = performance.now();
    const vDocs = await embeber(
      m.nombre,
      docs.map((d) => m.doc + d),
    );
    const vQ = await embeber(
      m.nombre,
      CONSULTAS.map((q) => m.query + q),
    );
    const segundos = (performance.now() - t0) / 1000;

    const nativos = vDocs.map(normalizar);
    const cortados = vDocs.map(truncar);

    const r: Record<string, number[]> = { r1: [], r5: [], r10: [], sp: [] };
    for (const q of vQ) {
      const rn = ranking(normalizar(q), nativos);
      const rc = ranking(truncar(q), cortados);
      r.r1?.push(recallEnK(rn, rc, 1));
      r.r5?.push(recallEnK(rn, rc, 5));
      r.r10?.push(recallEnK(rn, rc, 10));
      r.sp?.push(spearman(rn, rc));
    }
    const media = (xs: number[] = []) => xs.reduce((a, x) => a + x, 0) / (xs.length || 1);
    const fila = {
      modelo: m.nombre,
      dims_nativas: vDocs[0]?.length ?? 0,
      recall_1: +media(r.r1).toFixed(3),
      recall_5: +media(r.r5).toFixed(3),
      recall_10: +media(r.r10).toFixed(3),
      spearman: +media(r.sp).toFixed(3),
      segundos: +segundos.toFixed(1),
    };
    filas.push(fila);
    console.log(
      `${fila.modelo.padEnd(18)} ${String(fila.dims_nativas).padStart(4)} dims · ` +
        `r@1 ${fila.recall_1} · r@5 ${fila.recall_5} · r@10 ${fila.recall_10} · ` +
        `spearman ${fila.spearman} · ${fila.segundos}s`,
    );
  }

  const ruta = "artefactos/matryoshka-256.json";
  writeFileSync(
    ruta,
    `${JSON.stringify(
      {
        _procedencia: {
          medido_con: "collectors/src/rag/medir-matryoshka.ts",
          dims_truncadas: DIMS,
          textos: docs.length,
          consultas: CONSULTAS.length,
          nota:
            "Mide FIDELIDAD AL TRUNCADO de cada modelo contra sí mismo. NO compara " +
            "la calidad de recuperación de los dos modelos: eso exigiría juicios de " +
            "relevancia sobre las consultas, que no se han hecho.",
        },
        filas,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  console.log(`\nEscrito en ${ruta}. Interpretación y límites: docs/matryoshka-256.md`);
}

await main();
