import { describe, expect, it } from "vitest";
import {
  agruparContexto,
  type ConsultanteContexto,
  type FilaContexto,
  recuperarContexto,
} from "./contexto.ts";
import {
  activarEscaneoIterativo,
  SQL_ACTIVAR,
  SQL_COMPROBAR,
  SQL_FORZAR_CARGA,
  VALOR_ITERATIVE_SCAN,
} from "./escaneo-iterativo.ts";

const fila = (p: Partial<FilaContexto> = {}): FilaContexto => ({
  posicion_entidad: 1,
  origen: "norma",
  entidad_id: "454ca224-538e-4392-aeef-35f2540da1b1",
  entidad: "ley 1616 de 2013",
  chunk_id: "ley:1616:2013:art:1",
  referencia: "Ley 1616 de 2013, artículo 1",
  texto: "ARTÍCULO 1o. OBJETO.",
  caracteres: 20,
  url_fuente: "http://www.secretariasenado.gov.co/senado/basedoc/ley_1616_2013.html",
  captured_at: "2026-08-20T00:00:00.000Z",
  tier: "primaria",
  ...p,
});

describe("agruparContexto — chunks y huecos", () => {
  it("convierte filas en chunks listos para construirBloques", () => {
    const c = agruparContexto([fila(), fila({ chunk_id: "ley:1616:2013:art:2" })]);
    expect(c.chunks).toHaveLength(2);
    expect(c.chunks[0]?.id).toBe("ley:1616:2013:art:1");
    expect(c.chunks[0]?.fuente).toBe("norma");
    expect(c.huecos).toEqual([]);
    expect(c.advertencia).toBeNull();
  });

  /**
   * EL PUNTO DEL MÓDULO. Una norma que casa pero cuyo texto no se ha capturado
   * NO desaparece: `contexto_qa` la devuelve con `chunk_id` NULL y aquí se
   * convierte en un hueco con advertencia. Omitirla sería responder con menos
   * evidencia de la que existe y presentarlo como si fuera toda.
   */
  it("una entidad sin texto ingerido es un hueco, no una ausencia", () => {
    const c = agruparContexto([
      fila(),
      fila({ posicion_entidad: 2, entidad: "ley 2460 de 2025", chunk_id: null, texto: null }),
    ]);
    expect(c.chunks).toHaveLength(1);
    expect(c.huecos).toEqual([
      {
        entidad: "ley 2460 de 2025",
        origen: "norma",
        urlFuente: "http://www.secretariasenado.gov.co/senado/basedoc/ley_1616_2013.html",
      },
    ]);
    expect(c.advertencia).toContain("ley 2460 de 2025");
    expect(c.advertencia).toContain("puede estar incompleta");
  });

  /**
   * «Faltan algunas» y «no hay ninguna» no son el mismo aviso, y con el corpus
   * a medio ingerir el segundo es el estado habitual — hoy, de hecho, es el
   * único: `chunk` está vacía.
   */
  it("distingue «faltan algunas» de «no hay ninguna»", () => {
    const ninguna = agruparContexto([fila({ chunk_id: null, texto: null })]);
    expect(ninguna.chunks).toEqual([]);
    expect(ninguna.advertencia).toContain("No se puede responder con citas");
    expect(ninguna.advertencia).not.toContain("puede estar incompleta");
  });

  it("sin resultados no inventa advertencia", () => {
    expect(agruparContexto([])).toEqual({
      chunks: [],
      huecos: [],
      redactados: [],
      advertencia: null,
    });
  });

  /**
   * «No lo hemos capturado» y «no te lo podemos enseñar» son cosas distintas.
   * Un chunk que EXISTE (tiene id) pero llega sin texto no es una laguna del
   * corpus: es la política de egreso habiendo quitado el campo. Colapsarlo con
   * los huecos dejaría una censura disfrazada de laguna documental.
   */
  it("un chunk que existe pero llega sin texto es redacción, no hueco", () => {
    const c = agruparContexto([fila({ texto: null })]);
    expect(c.huecos).toEqual([]);
    expect(c.redactados).toEqual(["ley:1616:2013:art:1"]);
    expect(c.chunks).toEqual([]);
  });

  it("y con el campo ausente del todo, igual", () => {
    const sinCampo = fila();
    const { texto: _quitado, ...resto } = sinCampo;
    const c = agruparContexto([resto as typeof sinCampo]);
    expect(c.redactados).toEqual(["ley:1616:2013:art:1"]);
    expect(c.huecos).toEqual([]);
  });
});

describe("recuperarContexto", () => {
  function espia() {
    const llamadas: { nombre: string; args: Record<string, unknown> }[] = [];
    const db: ConsultanteContexto = {
      rpc: async (nombre, args) => {
        llamadas.push({ nombre, args });
        return { filas: [] };
      },
    };
    return { db, llamadas };
  }

  it("llama a contexto_qa con el embedding en null explícito", async () => {
    const { db, llamadas } = espia();
    await recuperarContexto(db, "salud mental");
    expect(llamadas[0]?.nombre).toBe("contexto_qa");
    expect(llamadas[0]?.args).toHaveProperty("consulta_embedding", null);
  });

  it("serializa el vector como literal de pgvector", async () => {
    const { db, llamadas } = espia();
    await recuperarContexto(db, "x", { embedding: [0.5, -0.25], maxChunksPorEntidad: 3 });
    expect(llamadas[0]?.args.consulta_embedding).toBe("[0.5,-0.25]");
    expect(llamadas[0]?.args).toHaveProperty("max_chunks_por_entidad", 3);
  });

  it("los topes que no se piden NO se mandan: manda el default del SQL", async () => {
    const { db, llamadas } = espia();
    await recuperarContexto(db, "x");
    expect(llamadas[0]?.args).not.toHaveProperty("max_entidades");
    expect(llamadas[0]?.args).not.toHaveProperty("max_chunks_por_entidad");
  });

  it("una consulta vacía no llega a la base", async () => {
    const { db, llamadas } = espia();
    const c = await recuperarContexto(db, "   ");
    expect(llamadas).toHaveLength(0);
    expect(c.advertencia).toBe("consulta vacía");
  });
});

/**
 * El parámetro cuyo fallo es silencioso por definición. Medido el 2026-08-20:
 * por defecto está en `off`, no se puede fijar en la definición de la función
 * (42501 en Supabase), y antes de que pgvector cargue su librería acepta
 * cualquier cadena como placeholder — un valor inválido se descarta al cargar,
 * sin avisar. Por eso hay comprobación y no solo un `set`.
 */
describe("activarEscaneoIterativo", () => {
  function ejecutor(setting: string | null, registrado = true) {
    const sqls: string[] = [];
    const fn = async (sql: string) => {
      sqls.push(sql);
      if (sql === SQL_COMPROBAR) {
        return registrado && setting !== null ? [{ setting }] : [];
      }
      return [];
    };
    return { fn, sqls };
  }

  it("fija el valor, fuerza la carga del módulo y COMPRUEBA, en ese orden", async () => {
    const { fn, sqls } = ejecutor(VALOR_ITERATIVE_SCAN);
    await activarEscaneoIterativo(fn);
    expect(sqls).toEqual([SQL_ACTIVAR, SQL_FORZAR_CARGA, SQL_COMPROBAR]);
  });

  it("lanza si el parámetro ni siquiera está registrado (placeholder sin efecto)", async () => {
    const { fn } = ejecutor(null, false);
    await expect(activarEscaneoIterativo(fn)).rejects.toThrow(/no llegó a cargarse/);
  });

  /** El caso que de verdad ocurre: una errata deja el parámetro en `off`. */
  it("lanza si quedó en off en vez del valor pedido", async () => {
    const { fn } = ejecutor("off");
    await expect(activarEscaneoIterativo(fn)).rejects.toThrow(/quedó en 'off'/);
  });
});
