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
  ensanchar,
  MAX_ENTIDADES_QA,
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
  // La encontró la mitad LÉXICA. Sin este campo, `buscar` concluiría —con
  // razón— que el texto no casó nada y reintentaría ensanchando.
  posicion_lexica: 1,
  posicion_semantica: null,
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

  /**
   * La unión estricto+ensanchado son DOS llamadas, cada una con su propio
   * presupuesto. Sin recorte, pedir 5 entidades devuelve hasta 10 y el prompt
   * del Q&A crece al doble sin que el llamador lo pida — contra una cuota
   * finita y sin que nada lo diga.
   */
  const porTanda = (tandas: unknown[][]): Consultante => {
    let i = 0;
    return { rpc: async () => ({ filas: tandas[i++] ?? [] }) };
  };

  const filaDe = (n: number) =>
    fila({
      entidad_id: `00000000-0000-0000-0000-00000000000${n}`,
      entidad: `ley ${n}`,
      chunk_id: `ley:${n}:art:1`,
      posicion_entidad: n,
    });

  it("recorta la unión al presupuesto de entidades pedido, estricto primero", async () => {
    const db = porTanda([
      [filaDe(1), filaDe(2), filaDe(3)],
      [filaDe(4), filaDe(5), filaDe(6), filaDe(7)],
    ]);
    const r = await contextoQa(db, "obligaciones de las empresas de salud", "api_bloque", {
      maxEntidades: 4,
    });
    expect(r.chunks.map((c) => c.id)).toEqual([
      "ley:1:art:1",
      "ley:2:art:1",
      "ley:3:art:1",
      "ley:4:art:1",
    ]);
  });

  it("por defecto el techo es el mismo que declara el SQL", async () => {
    expect(MAX_ENTIDADES_QA).toBe(5);
    const db = porTanda([
      [filaDe(1), filaDe(2), filaDe(3), filaDe(4), filaDe(5)],
      [filaDe(6), filaDe(7)],
    ]);
    const r = await contextoQa(db, "obligaciones de las empresas de salud", "api_bloque");
    expect(r.chunks).toHaveLength(MAX_ENTIDADES_QA);
  });

  /**
   * Anunciar un ensanchado cuyo aporte se acaba de recortar sería avisar de algo
   * que el lector no tiene delante: la advertencia describe el contexto que se
   * entregó, no la consulta que se intentó.
   */
  it("no anuncia ensanchado si lo ensanchado no sobrevivió al recorte", async () => {
    const db = porTanda([[filaDe(1), filaDe(2), filaDe(3), filaDe(4), filaDe(5)], [filaDe(9)]]);
    const r = await contextoQa(db, "obligaciones de las empresas de salud", "api_bloque");
    expect(r.advertencia ?? "").not.toContain("ENSANCHADA");
  });

  it("sí lo anuncia cuando el ensanchado ocupa un hueco que sobraba", async () => {
    const db = porTanda([[filaDe(1)], [filaDe(2)]]);
    const r = await contextoQa(db, "obligaciones de las empresas de salud", "api_bloque");
    expect(r.advertencia ?? "").toContain("ENSANCHADA");
    expect(r.chunks.map((c) => c.id)).toEqual(["ley:1:art:1", "ley:2:art:1"]);
  });

  /**
   * EL RECORTE NO PUEDE COMERSE LOS HUECOS, que es exactamente lo que hizo la
   * primera versión de esta función: con una sola cuenta, cinco entidades con
   * articulado agotaban el cupo y los huecos —que llegan al final, porque son
   * lo que aporta el ensanchado— desaparecían. Medido contra el gold set: 3
   * huecos por pregunta pasaron a 0. Borraba justo aquello para lo que se
   * construyó la unión.
   */
  it("un hueco no compite por el cupo de las entidades con texto", async () => {
    const hueco = (n: number) =>
      fila({
        entidad_id: `00000000-0000-0000-0000-0000000000f${n}`,
        entidad: `ley sin texto ${n}`,
        chunk_id: null,
        texto: null,
      });
    const db = porTanda([
      [filaDe(1), filaDe(2), filaDe(3), filaDe(4), filaDe(5)],
      [hueco(1), hueco(2)],
    ]);
    const r = await contextoQa(db, "obligaciones de las empresas de salud", "api_bloque");
    expect(r.chunks).toHaveLength(MAX_ENTIDADES_QA);
    expect(r.huecos.map((h) => h.entidad)).toEqual(["ley sin texto 1", "ley sin texto 2"]);
  });

  /**
   * Una fila cuyo `chunk_id` viene AUSENTE —no nulo— es un hueco igual.
   * Compararlo con `=== null` la contaba como entidad con texto y le hacía
   * gastar cupo de chunks a algo que no aporta ninguno.
   */
  it("una fila sin `chunk_id` es un hueco, aunque el campo venga ausente", async () => {
    const sinCampo = fila();
    delete (sinCampo as Record<string, unknown>).chunk_id;
    delete (sinCampo as Record<string, unknown>).texto;
    const r = await contextoQa(con([sinCampo]), "salud mental", "api_bloque");
    expect(r.huecos).toHaveLength(1);
    expect(r.chunks).toHaveLength(0);
    expect(r.redactados).toEqual([]);
  });

  it("pero los huecos tampoco son ilimitados: llevan su propio techo", async () => {
    const hueco = (n: number) =>
      fila({
        entidad_id: `00000000-0000-0000-0000-0000000000e${n}`,
        entidad: `hueco ${n}`,
        chunk_id: null,
        texto: null,
      });
    const db = porTanda([
      [filaDe(1)],
      [hueco(1), hueco(2), hueco(3), hueco(4), hueco(5), hueco(6), hueco(7)],
    ]);
    const r = await contextoQa(db, "obligaciones de las empresas de salud", "api_bloque");
    expect(r.huecos).toHaveLength(MAX_ENTIDADES_QA);
  });
});

describe("ensanchar — el AND que no encuentra nada", () => {
  /**
   * EL CASO QUE MOTIVA ESTO, medido el 2026-08-20: «¿cuántos proyectos de ley
   * sobre inteligencia artificial hay en el Senado?» devolvía CERO filas del
   * lado léxico, con 13 proyectos que llevan «INTELIGENCIA ARTIFICIAL» en el
   * título. `websearch_to_tsquery` exige TODOS los términos y ningún título
   * tiene los cinco.
   */
  it("pone los términos en OR y deja fuera el armazón de la pregunta", () => {
    // «proyectos», «ley» y «senado» son la FORMA de la pregunta; un OR que los
    // incluya devuelve cientos de coincidencias ajenas por encima del asunto.
    expect(ensanchar("proyectos de ley sobre inteligencia artificial en el Senado")).toBe(
      "sobre OR inteligencia OR artificial",
    );
  });

  it("«salud» no es armazón aunque sea frecuente: es el asunto", () => {
    expect(ensanchar("atención en salud mental para menores")).toContain("salud");
  });

  it("quita las tildes, que es como están los índices", () => {
    expect(ensanchar("atención integral")).toBe("atencion OR integral");
  });

  it("no ensancha lo que no tiene nada que ensanchar", () => {
    expect(ensanchar("telesalud")).toBeNull();
    expect(ensanchar("de la")).toBeNull();
  });

  it("no repite términos ni deja crecer la consulta sin tope", () => {
    expect(ensanchar("salud salud salud mental")).toBe("salud OR mental");
    expect(
      (ensanchar(Array.from({ length: 30 }, (_, i) => `palabra${i}`).join(" ")) ?? "").split(
        " OR ",
      ),
    ).toHaveLength(12);
  });
});

describe("el ensanchado se DECLARA, nunca se hace en silencio", () => {
  /** Devuelve vacío la primera vez y filas la segunda: el reintento. */
  const dbConReintento = (segundaTanda: unknown[]): Consultante => {
    let llamadas = 0;
    return {
      async rpc() {
        llamadas += 1;
        return { filas: llamadas === 1 ? [] : segundaTanda };
      },
    };
  };

  it("reintenta cuando el estricto devuelve cero, y lo dice", async () => {
    const r = await buscar(
      dbConReintento([FILA_BUSQUEDA]),
      "proyectos de ley sobre inteligencia artificial",
      "api_bloque",
    );
    expect(r.filas).toHaveLength(1);
    expect(r.ensanchada).toBe(true);
    expect(r.advertencia).toContain("búsqueda ensanchada");
  });

  /**
   * NUNCA empeora un resultado bueno: si el estricto encontró algo, no hay
   * reintento. Un buscador que ensancha siempre deja de distinguir «esto casa
   * con lo que pediste» de «esto casa con una palabra de lo que pediste».
   */
  /**
   * EL CASO QUE SE ESCAPABA. Con vector, `hybrid_search` devuelve algo casi
   * siempre; que no esté vacío NO significa que el texto haya casado. Una fila
   * con `posicion_lexica: null` la encontró solo el vector, y entonces falta
   * todo lo que únicamente el léxico podía traer.
   */
  it("ensancha aunque haya filas, si NINGUNA la encontró el léxico", async () => {
    const soloVector = { ...FILA_BUSQUEDA, posicion_lexica: null, posicion_semantica: 1 };
    const porLexico = { ...FILA_BUSQUEDA, id: "uuid-2" };
    let llamadas = 0;
    const db2: Consultante = {
      async rpc() {
        llamadas += 1;
        return { filas: llamadas === 1 ? [soloVector] : [porLexico] };
      },
    };
    const r = await buscar(db2, "inteligencia artificial en salud", "api_bloque");
    expect(llamadas).toBe(2);
    expect(r.ensanchada).toBe(true);
  });

  /**
   * EL COMENTARIO DECÍA «ensanchar no puede QUITAR resultados» Y SÍ PODÍA.
   *
   * El reintento usa otra tsquery y por tanto otro ranking RRF: la fila que solo
   * encontró el vector puede no volver a salir. Devolver las filas del reintento
   * a secas la borraba, y el usuario perdía un resultado por pedir MÁS.
   */
  it("la unión conserva lo que encontró el estricto, no lo sustituye", async () => {
    const soloVector = { ...FILA_BUSQUEDA, id: "uuid-solo-vector", posicion_lexica: null };
    let llamadas = 0;
    const db2: Consultante = {
      async rpc() {
        llamadas += 1;
        return { filas: llamadas === 1 ? [soloVector] : [{ ...FILA_BUSQUEDA, id: "uuid-lexica" }] };
      },
    };
    const r = await buscar(db2, "inteligencia artificial en salud", "api_bloque");
    expect(r.filas.map((f) => f.id)).toEqual(["uuid-solo-vector", "uuid-lexica"]);
  });

  /** Y la unión respeta el `limite` que se pidió: no devuelve el doble. */
  it("la unión se recorta al límite pedido", async () => {
    const fila = (id: string, lex: number | null) => ({
      ...FILA_BUSQUEDA,
      id,
      posicion_lexica: lex,
    });
    let llamadas = 0;
    const db2: Consultante = {
      async rpc() {
        llamadas += 1;
        return {
          filas:
            llamadas === 1
              ? [fila("a", null), fila("b", null)]
              : [fila("c", 1), fila("d", 2), fila("e", 3)],
        };
      },
    };
    const r = await buscar(db2, "inteligencia artificial en salud", "api_bloque", 3);
    expect(r.filas.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  /**
   * Si el ensanchado no aporta ninguna fila nueva, no se anuncia: la
   * advertencia describe el contexto que se entregó, no la consulta que se
   * intentó.
   */
  it("no anuncia ensanchado cuando el reintento no aporta nada nuevo", async () => {
    const soloVector = { ...FILA_BUSQUEDA, posicion_lexica: null };
    const db2: Consultante = {
      async rpc() {
        return { filas: [soloVector] };
      },
    };
    const r = await buscar(db2, "inteligencia artificial en salud", "api_bloque");
    expect(r.ensanchada).toBe(false);
    expect(r.filas).toHaveLength(1);
  });

  it("no reintenta si el estricto ya encontró algo", async () => {
    let llamadas = 0;
    const db2: Consultante = {
      async rpc() {
        llamadas += 1;
        return { filas: [FILA_BUSQUEDA] };
      },
    };
    const r = await buscar(db2, "salud mental infantil", "api_bloque");
    expect(llamadas).toBe(1);
    expect(r.ensanchada).toBe(false);
    expect(r.advertencia).toBeNull();
  });

  it("si el reintento tampoco encuentra nada, no se declara ensanchado", async () => {
    const r = await buscar(db([]), "criptomonedas en el metaverso", "api_bloque");
    expect(r.ensanchada).toBe(false);
    expect(r.advertencia).toContain("no aparece en lo capturado");
  });

  /** Ensanchar puede AÑADIR resultados; nunca quitarlos. */
  it("un reintento vacío no borra lo que el vector había encontrado", async () => {
    const soloVector = { ...FILA_BUSQUEDA, posicion_lexica: null, posicion_semantica: 1 };
    let llamadas = 0;
    const db2: Consultante = {
      async rpc() {
        llamadas += 1;
        return { filas: llamadas === 1 ? [soloVector] : [] };
      },
    };
    const r = await buscar(db2, "inteligencia artificial en salud", "api_bloque");
    expect(r.filas).toHaveLength(1);
    expect(r.ensanchada).toBe(false);
  });

  /**
   * La vigencia se consulta por IDENTIDAD de norma, no por texto. Ensancharla
   * devolvería la vigencia de otra norma, que es peor que no devolver nada.
   */
  it("la vigencia no se ensancha nunca", async () => {
    let llamadas = 0;
    const db2: Consultante = {
      async rpc() {
        llamadas += 1;
        return { filas: [] };
      },
    };
    const r = await vigencia(db2, { tipo: "ley", numero: "9999", anio: 2099 }, "api_bloque");
    expect(llamadas).toBe(1);
    expect(r.ensanchada).toBe(false);
  });
});
