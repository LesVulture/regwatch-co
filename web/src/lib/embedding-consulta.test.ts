/**
 * El camino DEGRADADO de la búsqueda semántica, probado sin Ollama.
 *
 * Es el que hay que fijar: en cualquier despliegue sin Ollama al alcance, este
 * módulo devuelve `vector: null` y la búsqueda sigue funcionando por la mitad
 * léxica. Si en vez de eso lanzara, un Ollama caído tumbaría el producto entero
 * — y eso es lo que su cabecera promete que no pasa.
 */

import { describe, expect, it } from "vitest";
import { DIMS, DIMS_NATIVAS } from "../../../collectors/src/rag/embeddings.ts";
import { embeberConsulta } from "./embedding-consulta.ts";

const vectorFalso = () =>
  Array.from({ length: DIMS_NATIVAS }, (_, i) => Math.sin((i + 1) * 1.7) / (i + 1));

const respuesta = (cuerpo: unknown) =>
  ({ ok: true, status: 200, json: async () => cuerpo }) as unknown as Response;

describe("embeberConsulta", () => {
  it("devuelve el vector truncado a las dims del esquema", async () => {
    const r = await embeberConsulta("salud mental", {
      fetch: async () => respuesta({ embeddings: [vectorFalso()] }),
    });
    expect(r.motivo).toBeNull();
    expect(r.vector).toHaveLength(DIMS);
  });

  it("una consulta vacía no llama a Ollama", async () => {
    let llamadas = 0;
    const r = await embeberConsulta("   ", {
      fetch: async () => {
        llamadas++;
        return respuesta({ embeddings: [] });
      },
    });
    expect(llamadas).toBe(0);
    expect(r.motivo).toBe("consulta vacía");
  });

  /** EL CASO QUE SOSTIENE LA CABECERA: Ollama caído no tumba la búsqueda. */
  it("con Ollama caído NO lanza: devuelve null con su motivo", async () => {
    const r = await embeberConsulta("salud mental", {
      fetch: async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      },
    });
    expect(r.vector).toBeNull();
    expect(r.motivo).toContain("ECONNREFUSED");
  });

  it("un HTTP de error tampoco lanza", async () => {
    const r = await embeberConsulta("salud mental", {
      fetch: async () =>
        ({ ok: false, status: 500, text: async () => "boom" }) as unknown as Response,
    });
    expect(r.vector).toBeNull();
    expect(r.motivo).toContain("500");
  });

  /**
   * Un vector de otras dimensiones significa OTRO modelo detrás del mismo
   * nombre. `embeberLote` lo rechaza, y aquí eso tiene que degradar —no
   * lanzar—: mezclar dimensiones daría un ranking plausible y equivocado.
   */
  it("un modelo con otras dimensiones degrada en vez de mezclar vectores", async () => {
    const r = await embeberConsulta("salud mental", {
      fetch: async () => respuesta({ embeddings: [new Array(1024).fill(0.1)] }),
    });
    expect(r.vector).toBeNull();
    expect(r.motivo).toContain("1024");
  });

  it("una respuesta sin `embeddings` degrada con su motivo", async () => {
    const r = await embeberConsulta("salud mental", {
      fetch: async () => respuesta({ data: [] }),
    });
    expect(r.vector).toBeNull();
    expect(r.motivo).toContain("embeddings");
  });
});
