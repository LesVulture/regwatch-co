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
   * Si `busqueda_lexica` o `consultar_vigencia` añaden una columna y nadie la
   * declara aquí, deja de publicarse en silencio. Este test hace visible el
   * contrato entre el SQL y la política.
   */
  it("declara los campos de busqueda_lexica", () => {
    for (const c of ["origen", "titulo", "referencia", "url_fuente", "captured_at", "tier"]) {
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
