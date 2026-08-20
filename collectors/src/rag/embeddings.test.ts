/**
 * El adaptador de embeddings, probado sin gastar un token.
 *
 * `fetch` se inyecta. No es una comodidad de test: separar la forma de la
 * petición de la llamada es lo que permite escribir y validar esta capa antes
 * de que el proyecto tenga clave de API.
 */

import { describe, expect, it } from "vitest";
import {
  cuerpoPeticion,
  DIMS,
  embeberLote,
  estaNormalizado,
  LOTE_MAX,
  lotes,
  truncarYNormalizar,
} from "./embeddings.ts";

/** Vector normalizado de 2048 dims con energía repartida de forma desigual. */
function vectorFalso(semilla: number, dims = 2048): number[] {
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
    const r = truncarYNormalizar(new Array(2048).fill(0));
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
    expect(ls).toHaveLength(3);
    expect(ls[0]).toHaveLength(LOTE_MAX);
    expect(ls.flat()).toEqual(xs);
  });

  /**
   * `input_type` cambia el embedding. Embeber consultas como `document`
   * degrada el ranking sin dar ningún error.
   */
  it("distingue documento de consulta", () => {
    expect(cuerpoPeticion(["x"], "document").input_type).toBe("document");
    expect(cuerpoPeticion(["x"], "query").input_type).toBe("query");
    expect(cuerpoPeticion(["x"], "query").output_dimension).toBe(DIMS);
  });
});

describe("embeberLote — sin red, con fetch inyectado", () => {
  const ok = (n: number) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        data: Array.from({ length: n }, (_, i) => ({
          index: i,
          embedding: vectorFalso(i + 1),
        })),
      }),
    }) as unknown as Response;

  const deps = (r: Response) => ({ fetch: async () => r, apiKey: "sin-clave-real" });

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

  it("respeta el `index` de la respuesta en vez de asumir el orden", async () => {
    const desordenada = {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { index: 1, embedding: vectorFalso(2) },
          { index: 0, embedding: vectorFalso(1) },
        ],
      }),
    } as unknown as Response;
    const r = await embeberLote(
      [
        { id: "primero", texto: "a" },
        { id: "segundo", texto: "b" },
      ],
      "document",
      deps(desordenada),
    );
    // El primer elemento de `data` traía index 1 → le toca «segundo».
    expect(r[0]?.id).toBe("segundo");
    expect(r[1]?.id).toBe("primero");
  });

  it("un error HTTP se propaga con su cuerpo", async () => {
    const malo = {
      ok: false,
      status: 429,
      text: async () => "rate limit",
    } as unknown as Response;
    await expect(embeberLote([{ id: "a", texto: "a" }], "document", deps(malo))).rejects.toThrow(
      /429.*rate limit/,
    );
  });

  it("un lote vacío no llama a la API", async () => {
    let llamadas = 0;
    const r = await embeberLote([], "document", {
      fetch: async () => {
        llamadas++;
        return ok(0);
      },
      apiKey: "x",
    });
    expect(r).toEqual([]);
    expect(llamadas).toBe(0);
  });

  it("un lote por encima del máximo se rechaza antes de llamar", async () => {
    const grande = Array.from({ length: LOTE_MAX + 1 }, (_, i) => ({ id: `${i}`, texto: "x" }));
    await expect(embeberLote(grande, "document", deps(ok(0)))).rejects.toThrow(/el máximo es/);
  });
});
