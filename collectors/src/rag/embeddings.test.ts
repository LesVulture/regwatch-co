/**
 * El adaptador de embeddings, probado sin red.
 *
 * `fetch` se inyecta. No es una comodidad de test: separar la forma de la
 * petición de la llamada es lo que permite validar esta capa sin depender de
 * que Ollama esté vivo en la máquina que corre el CI.
 */

import { describe, expect, it } from "vitest";
import {
  cuerpoPeticion,
  DIMS,
  DIMS_NATIVAS,
  embeberLote,
  estaNormalizado,
  LOTE_MAX,
  lotes,
  MODELO,
  MODELO_ETIQUETA,
  PREFIJOS,
  truncarYNormalizar,
} from "./embeddings.ts";

/** Vector normalizado con energía repartida de forma desigual. */
function vectorFalso(semilla: number, dims = DIMS_NATIVAS): number[] {
  const v = Array.from({ length: dims }, (_, i) => Math.sin((i + 1) * semilla) / (i + 1));
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return v.map((x) => x / n);
}

describe("truncación Matryoshka y la trampa de la norma", () => {
  /**
   * LA RAZÓN DE SER DE ESTE MÓDULO. Truncar un vector normalizado lo
   * DESNORMALIZA, y la receta habitual de pgvector usa producto interno, que
   * solo equivale al coseno con vectores normalizados. Sin re-normalizar, el
   * ranking premia a los vectores de norma grande: deja de medir parecido y
   * empieza a medir longitud. Y no falla — devuelve resultados peores en un
   * orden que nadie revisa.
   */
  it("truncar sin más rompe la norma: aquí está la prueba", () => {
    const v = vectorFalso(1.7);
    expect(estaNormalizado(v)).toBe(true);
    const cortadoCrudo = v.slice(0, DIMS);
    expect(estaNormalizado(cortadoCrudo)).toBe(false);
  });

  it("truncarYNormalizar devuelve 256 dims y norma 1", () => {
    const r = truncarYNormalizar(vectorFalso(1.7));
    expect(r).toHaveLength(DIMS);
    expect(estaNormalizado(r)).toBe(true);
  });

  it("la dirección se conserva: solo cambia la escala", () => {
    const v = vectorFalso(0.3);
    const r = truncarYNormalizar(v);
    // Cada componente mantiene su proporción respecto de la primera.
    const factor = (r[0] as number) / (v[0] as number);
    for (let i = 1; i < 10; i++) {
      expect((r[i] as number) / (v[i] as number)).toBeCloseTo(factor, 9);
    }
  });

  it("un vector nulo no produce NaN", () => {
    const r = truncarYNormalizar(new Array(DIMS_NATIVAS).fill(0));
    expect(r.every((x) => x === 0)).toBe(true);
  });

  it("un vector más corto que las dims pedidas falla ruidosamente", () => {
    expect(() => truncarYNormalizar([1, 2, 3])).toThrow(/menos que las 256/);
  });
});

describe("lotes y forma de la petición", () => {
  it("trocea respetando el máximo", () => {
    const xs = Array.from({ length: 300 }, (_, i) => i);
    const ls = lotes(xs);
    expect(ls).toHaveLength(Math.ceil(300 / LOTE_MAX));
    expect(ls[0]).toHaveLength(LOTE_MAX);
    expect(ls.flat()).toEqual(xs);
  });

  /**
   * El prefijo de tarea de nomic-embed-text cambia el embedding, igual que
   * cambiaba el `input_type` de Voyage. Embeber consultas como documento
   * degrada el ranking sin dar ningún error.
   */
  it("distingue documento de consulta con el prefijo del modelo", () => {
    expect(cuerpoPeticion(["x"], "document").input[0]).toBe(`${PREFIJOS.document}x`);
    expect(cuerpoPeticion(["x"], "query").input[0]).toBe(`${PREFIJOS.query}x`);
    expect(PREFIJOS.document).not.toBe(PREFIJOS.query);
  });

  it("pide el modelo local y prohíbe el truncado silencioso de Ollama", () => {
    const c = cuerpoPeticion(["x"], "document");
    expect(c.model).toBe(MODELO);
    // Con `truncate: true` (el defecto de Ollama) un artículo largo se
    // embebería a medias y el vector saldría plausible y equivocado.
    expect(c.truncate).toBe(false);
  });

  it("la etiqueta que va a la base lleva el modelo Y las dimensiones", () => {
    expect(MODELO_ETIQUETA).toBe(`${MODELO}@${DIMS}`);
  });
});

describe("embeberLote — sin red, con fetch inyectado", () => {
  const ok = (n: number, dims = DIMS_NATIVAS) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        embeddings: Array.from({ length: n }, (_, i) => vectorFalso(i + 1, dims)),
      }),
    }) as unknown as Response;

  const deps = (r: Response) => ({ fetch: async () => r });

  it("empareja cada chunk con su vector y los devuelve normalizados", async () => {
    const entradas = [
      { id: "ley:1616:2013:art:1", texto: "a" },
      { id: "ley:1616:2013:art:2", texto: "b" },
    ];
    const r = await embeberLote(entradas, "document", deps(ok(2)));
    expect(r.map((x) => x.id)).toEqual(entradas.map((e) => e.id));
    for (const e of r) {
      expect(e.vector).toHaveLength(DIMS);
      expect(estaNormalizado(e.vector)).toBe(true);
    }
  });

  /**
   * EL FALLO CARO DE ESTA CAPA. Un lote que vuelve incompleto emparejaría cada
   * chunk con el vector del siguiente. No lanza nada: produce un índice que
   * devuelve resultados plausibles y equivocados.
   */
  it("un lote incompleto se rechaza en vez de desplazar el emparejamiento", async () => {
    const entradas = [
      { id: "a", texto: "a" },
      { id: "b", texto: "b" },
      { id: "c", texto: "c" },
    ];
    await expect(embeberLote(entradas, "document", deps(ok(2)))).rejects.toThrow(
      /emparejamiento chunk↔vector/,
    );
  });

  /**
   * Ollama sirve por NOMBRE, y el nombre no garantiza el modelo: `ollama pull`
   * de otra etiqueta bajo el mismo alias cambiaría las dimensiones y los
   * vectores nuevos dejarían de ser comparables con los ya escritos. Nada en la
   * respuesta lo diría; el conteo de dimensiones sí.
   */
  it("rechaza vectores de otras dimensiones: sería otro modelo detrás del mismo nombre", async () => {
    await expect(
      embeberLote([{ id: "a", texto: "a" }], "document", deps(ok(1, 1024))),
    ).rejects.toThrow(/1024 dimensiones/);
  });

  it("mantiene el orden en que Ollama devuelve los vectores", async () => {
    const r = await embeberLote(
      [
        { id: "primero", texto: "a" },
        { id: "segundo", texto: "b" },
      ],
      "document",
      deps(ok(2)),
    );
    expect(r.map((x) => x.id)).toEqual(["primero", "segundo"]);
  });

  it("un error HTTP se propaga con su cuerpo", async () => {
    const malo = {
      ok: false,
      status: 500,
      text: async () => "model not found",
    } as unknown as Response;
    await expect(embeberLote([{ id: "a", texto: "a" }], "document", deps(malo))).rejects.toThrow(
      /500.*model not found/,
    );
  });

  it("una respuesta sin `embeddings` no se interpreta a la buena de Dios", async () => {
    const rara = {
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as unknown as Response;
    await expect(embeberLote([{ id: "a", texto: "a" }], "document", deps(rara))).rejects.toThrow(
      /sin `embeddings`/,
    );
  });

  it("un lote vacío no llama a Ollama", async () => {
    let llamadas = 0;
    const r = await embeberLote([], "document", {
      fetch: async () => {
        llamadas++;
        return ok(0);
      },
    });
    expect(r).toEqual([]);
    expect(llamadas).toBe(0);
  });

  it("un lote por encima del máximo se rechaza antes de llamar", async () => {
    const grande = Array.from({ length: LOTE_MAX + 1 }, (_, i) => ({ id: `${i}`, texto: "x" }));
    await expect(embeberLote(grande, "document", deps(ok(0)))).rejects.toThrow(/el máximo es/);
  });
});
