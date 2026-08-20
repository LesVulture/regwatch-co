/**
 * La frontera del producto, probada sin base de datos.
 *
 * El cliente se inyecta. Lo que se comprueba aquí no es el SQL —eso lo cubren
 * las sondas contra la instancia real— sino que **nada salga sin pasar por la
 * política de egreso**, y que un resultado vacío se comunique como lo que es.
 */

import { describe, expect, it } from "vitest";
import {
  buscar,
  type Consultante,
  contextoQa,
  PROCEDENCIA_CAMPOS,
  verificarProcedencia,
  vigencia,
} from "./consultas.ts";

const db = (filas: unknown[]): Consultante => ({ rpc: async () => ({ filas }) });

const FILA_BUSQUEDA = {
  origen: "norma",
  id: "uuid-1",
  titulo: "Ley de Salud Mental",
  referencia: "ley 1616 de 2013",
  url_fuente: "http://www.secretariasenado.gov.co/x.html",
  captured_at: "2026-08-20T00:00:00.000Z",
  tier: "primaria",
};

describe("buscar", () => {
  it("devuelve las filas con su procedencia intacta", async () => {
    const r = await buscar(db([FILA_BUSQUEDA]), "salud mental", "api_bloque");
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]?.url_fuente).toContain("secretariasenado");
    expect(r.filas[0]?.tier).toBe("primaria");
    expect(r.advertencia).toBeNull();
  });

  /**
   * LA FRASE IMPORTA TANTO COMO EL DATO. «Sin resultados» y «no existe» son
   * cosas distintas, y el gold set castiga confundirlas (G006).
   */
  it("un resultado vacío se comunica como «no aparece», no como «no existe»", async () => {
    const r = await buscar(db([]), "metaverso", "api_bloque");
    expect(r.filas).toEqual([]);
    expect(r.advertencia).toContain("no aparece en lo capturado");
    expect(r.advertencia).toContain("no que no exista");
  });

  it("una consulta vacía no llega a la base", async () => {
    let llamadas = 0;
    const espia: Consultante = {
      rpc: async () => {
        llamadas++;
        return { filas: [] };
      },
    };
    const r = await buscar(espia, "   ", "api_bloque");
    expect(llamadas).toBe(0);
    expect(r.advertencia).toBe("consulta vacía");
  });

  /**
   * LISTA BLANCA. Que la consulta devuelva una columna no la publica: publicarla
   * es añadir una línea a PROCEDENCIA_CAMPOS, que se ve en el diff.
   */
  it("un campo que la base devuelve y la política no declara NO sale", async () => {
    const conExtra = { ...FILA_BUSQUEDA, columna_interna: "secreto" };
    const r = await buscar(db([conExtra]), "x", "api_bloque");
    expect(r.filas[0]?.columna_interna).toBeUndefined();
    expect(r.omitidos).toContain("columna_interna");
  });

  it("los campos omitidos se reportan: un filtro mudo no es auditable", async () => {
    const r = await buscar(db([{ ...FILA_BUSQUEDA, otra: 1, mas: 2 }]), "x", "dump");
    expect([...r.omitidos].sort()).toEqual(["mas", "otra"]);
  });
});

describe("vigencia", () => {
  const FILA_VIGENCIA = {
    veredicto: "AFECTADA — el cambio ya surtió efecto a la fecha consultada",
    articulo: "1",
    fecha_efecto: "2025-06-18",
    norma_afectante: "ley 2460 de 2025",
    clausula_prueba: "ARTÍCULO 3o. Modifíquese el artículo 1o de la Ley 1616 de 2013…",
    procedencia: "declarado_en_norma · tier primaria",
    verificable_en: "http://www.secretariasenado.gov.co/y.html",
  };

  it("devuelve el veredicto con la cláusula que lo prueba", async () => {
    const r = await vigencia(
      db([FILA_VIGENCIA]),
      { tipo: "ley", numero: "1616", anio: 2013 },
      "ficha_individual",
    );
    expect(r.filas[0]?.veredicto).toContain("AFECTADA");
    expect(r.filas[0]?.clausula_prueba).toContain("Modifíquese");
    expect(r.filas[0]?.verificable_en).toBeTruthy();
  });

  /**
   * EL ERROR QUE ESTE PROYECTO EXISTE PARA NO COMETER. Cero afectaciones NO es
   * «vigente sin cambios»: es que no se ha capturado ninguna. La advertencia lo
   * dice literalmente para que quien construya la UI no tenga que deducirlo.
   */
  it("cero afectaciones NO se comunica como «vigente para siempre»", async () => {
    const r = await vigencia(db([]), { tipo: "ley", numero: "9999", anio: 2020 }, "api_bloque");
    expect(r.filas).toEqual([]);
    expect(r.advertencia).toContain("NO significa");
    expect(r.advertencia).toContain("no se ha capturado ninguna");
  });
});

describe("verificarProcedencia", () => {
  it("acepta una fila con url y captura", () => {
    expect(verificarProcedencia([FILA_BUSQUEDA])).toEqual([]);
  });

  it("señala una fila sin url de fuente", () => {
    const { url_fuente: _, ...sinUrl } = FILA_BUSQUEDA;
    expect(verificarProcedencia([sinUrl])[0]).toContain("sin url de fuente");
  });

  it("señala captured_at vacío cuando el campo está presente", () => {
    expect(verificarProcedencia([{ ...FILA_BUSQUEDA, captured_at: "" }])[0]).toContain(
      "captured_at",
    );
  });

  it("no exige captured_at donde la consulta no lo devuelve", () => {
    expect(verificarProcedencia([{ verificable_en: "http://x" }])).toEqual([]);
  });
});

describe("la lista blanca cubre lo que las funciones devuelven", () => {
  /**
   * Si `hybrid_search` o `consultar_vigencia` añaden una columna y nadie la
   * declara aquí, deja de publicarse en silencio. Este test hace visible el
   * contrato entre el SQL y la política.
   */
  it("declara los campos de hybrid_search", () => {
    for (const c of [
      "origen",
      "titulo",
      "referencia",
      "url_fuente",
      "captured_at",
      "tier",
      // Los metadatos de ranking. `posicion_semantica: null` dice, sin prosa,
      // que a esa fila la encontró el texto y no el vector.
      "score",
      "posicion_lexica",
      "posicion_semantica",
    ]) {
      expect(PROCEDENCIA_CAMPOS[c], `falta ${c}`).toBeTruthy();
    }
  });

  it("declara los campos de consultar_vigencia, y la cláusula como texto oficial", () => {
    for (const c of ["veredicto", "fecha_efecto", "norma_afectante", "verificable_en"]) {
      expect(PROCEDENCIA_CAMPOS[c], `falta ${c}`).toBeTruthy();
    }
    // La cláusula es texto normativo: sale, pero con las condiciones del art. 41.
    expect(PROCEDENCIA_CAMPOS.clausula_prueba).toBe("normativo_oficial");
  });
});

/**
 * QUÉ función llama la capa de producto, no solo qué campos deja pasar.
 *
 * El doble de base que usa el resto del fichero ignora el nombre del RPC
 * (`rpc: async () => ({ filas })`), así que `buscar()` podía seguir llamando a
 * `busqueda_lexica` y los tests pasaban igual. Eso es el mismo contrato
 * colgando una capa más arriba: `hybrid_search` existe y nadie comprueba que
 * el producto pase por ella.
 */
describe("buscar() pasa por hybrid_search, también sin vector", () => {
  function espia() {
    const llamadas: { nombre: string; args: Record<string, unknown> }[] = [];
    const db: Consultante = {
      rpc: async (nombre, args) => {
        llamadas.push({ nombre, args });
        return { filas: [] };
      },
    };
    return { db, llamadas };
  }

  it("llama a hybrid_search y no a busqueda_lexica", async () => {
    const { db, llamadas } = espia();
    await buscar(db, "salud mental", "api_bloque");
    expect(llamadas[0]?.nombre).toBe("hybrid_search");
  });

  /**
   * El embedding va NULL explícito, no ausente: es lo que apaga el CTE
   * semántico y hace que la función degrade exactamente a la búsqueda léxica.
   */
  it("manda consulta_embedding en null cuando no hay vector", async () => {
    const { db, llamadas } = espia();
    await buscar(db, "salud mental", "api_bloque");
    expect(llamadas[0]?.args).toHaveProperty("consulta_embedding", null);
  });

  /** Con vector, se serializa al literal que pgvector espera. */
  it("serializa el vector como literal de pgvector", async () => {
    const { db, llamadas } = espia();
    await buscar(db, "bebidas azucaradas", "api_bloque", 20, {
      embedding: [0.5, -0.25, 0],
      pesoSemantico: 2,
    });
    expect(llamadas[0]?.args.consulta_embedding).toBe("[0.5,-0.25,0]");
    expect(llamadas[0]?.args).toHaveProperty("peso_semantico", 2);
  });

  /** Los pesos que no se piden NO se mandan: manda el default del SQL. */
  it("no inventa pesos cuando no se piden", async () => {
    const { db, llamadas } = espia();
    await buscar(db, "salud", "api_bloque");
    expect(llamadas[0]?.args).not.toHaveProperty("peso_lexico");
    expect(llamadas[0]?.args).not.toHaveProperty("peso_semantico");
  });

  /** Una consulta vacía no llega a la base. */
  it("no llama a la base con una consulta vacía", async () => {
    const { db, llamadas } = espia();
    const r = await buscar(db, "   ", "api_bloque");
    expect(llamadas).toHaveLength(0);
    expect(r.advertencia).toBe("consulta vacía");
  });
});

/**
 * El Q&A NO puede ser una segunda puerta de egreso.
 *
 * `recuperarContexto()` de `rag/contexto.ts` devuelve el articulado completo y
 * NO pasa por esta frontera: al escribirlo construí el endpoint número catorce
 * y no me acordé, que es literalmente el fallo que el comentario de cabecera de
 * este módulo predice. `contextoQa()` es la versión que sí pasa.
 */
describe("contextoQa — el Q&A sale por la misma puerta", () => {
  const fila = (p: Record<string, unknown> = {}) => ({
    posicion_entidad: 1,
    origen: "norma",
    entidad_id: "454ca224-538e-4392-aeef-35f2540da1b1",
    entidad: "ley 1616 de 2013",
    chunk_id: "ley:1616:2013:art:1",
    referencia: "Ley 1616 de 2013, artículo 1",
    texto: "ARTÍCULO 1o. OBJETO.",
    caracteres: 20,
    url_fuente: "http://x/ley_1616_2013.html",
    captured_at: "2026-08-20T00:00:00.000Z",
    tier: "primaria",
    ...p,
  });

  const con = (filas: unknown[]): Consultante => ({ rpc: async () => ({ filas }) });

  it("deja pasar el articulado y su procedencia", async () => {
    const r = await contextoQa(con([fila()]), "salud mental", "api_bloque");
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0]?.texto).toBe("ARTÍCULO 1o. OBJETO.");
    expect(r.chunks[0]?.urlFuente).toBe("http://x/ley_1616_2013.html");
    expect(r.omitidos).toEqual([]);
  });

  /**
   * LO QUE ESTO ATAJA, y no es el presente: el campo que alguien añada MAÑANA a
   * `chunk`. Sin declarar en la lista blanca, no sale — y se REPORTA, porque un
   * filtro mudo no es auditable.
   */
  it("un campo no declarado NO sale, y se reporta", async () => {
    const r = await contextoQa(
      con([fila({ nota_del_editor: "prosa de Avance Jurídico" })]),
      "salud mental",
      "api_bloque",
    );
    expect(r.omitidos).toContain("nota_del_editor");
    expect(JSON.stringify(r.chunks)).not.toContain("Avance Jurídico");
  });

  it("el articulado va como texto normativo, no como metadato suelto", () => {
    expect(PROCEDENCIA_CAMPOS.texto).toBe("normativo_oficial");
  });

  /** Un hueco de corpus y una redacción de política no son lo mismo. */
  it("distingue el hueco de evidencia de lo que la política quitó", async () => {
    const hueco = await contextoQa(con([fila({ chunk_id: null, texto: null })]), "x", "api_bloque");
    expect(hueco.huecos).toHaveLength(1);
    expect(hueco.redactados).toEqual([]);
  });

  it("una consulta vacía no llega a la base", async () => {
    let llamada = false;
    const db: Consultante = {
      rpc: async () => {
        llamada = true;
        return { filas: [] };
      },
    };
    const r = await contextoQa(db, "  ", "api_bloque");
    expect(llamada).toBe(false);
    expect(r.advertencia).toBe("consulta vacía");
  });
});
