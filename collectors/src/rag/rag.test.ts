import { describe, expect, it } from "vitest";
import { chunkNorma, estadisticas } from "./chunking.ts";
import { puedePublicarse, validarCitas } from "./citas.ts";

const LEY = `
<p>ART&Iacute;CULO 1o. Objeto. La presente ley regula la materia.</p>
<p>ART&Iacute;CULO 2o. Definiciones. Para efectos de esta ley se entiende por
sistema aquello que la reglamentaci&oacute;n determine.</p>
<p>ART&Iacute;CULO 3o. VIGENCIA. Rige a partir de su publicaci&oacute;n.</p>`;

const OPC = {
  tipo: "Ley",
  numero: "1616",
  anio: 2013,
  urlFuente: "http://www.secretariasenado.gov.co/senado/basedoc/ley_1616_2013.html",
  capturedAt: "2026-08-20T00:00:00.000Z",
};

describe("chunking por artículo", () => {
  it("produce un chunk por artículo, no por N tokens", () => {
    const c = chunkNorma(LEY, OPC);
    expect(c).toHaveLength(3);
    expect(c.map((x) => x.referencia)).toEqual([
      "Ley 1616 de 2013, artículo 1",
      "Ley 1616 de 2013, artículo 2",
      "Ley 1616 de 2013, artículo 3",
    ]);
  });

  /**
   * El id tiene que ser ESTABLE: R2 post-valida que cada cita resuelva a un
   * chunk existente, y eso no funciona si el id cambia al reindexar. Y legible,
   * porque un id opaco convierte cada auditoría de una cita en una consulta.
   */
  it("el id es estable, legible y reconstruible desde la referencia", () => {
    const c = chunkNorma(LEY, OPC);
    expect(c[0]?.id).toBe("ley:1616:2013:art:1");
    // Reindexar el mismo texto da los mismos ids.
    expect(chunkNorma(LEY, OPC).map((x) => x.id)).toEqual(c.map((x) => x.id));
  });

  it("cada chunk arrastra su procedencia", () => {
    for (const c of chunkNorma(LEY, OPC)) {
      expect(c.urlFuente).toContain("secretariasenado");
      expect(c.capturedAt).toBe("2026-08-20T00:00:00.000Z");
    }
  });

  /**
   * Un artículo NO se subdivide aunque sea largo: subdividirlo devuelve el
   * problema que el chunking por artículo resuelve —la obligación separada de
   * su excepción—. Si no cabe, se traen menos artículos, no medio artículo.
   */
  it("un artículo largo se mantiene entero", () => {
    const largo = `<p>ART&Iacute;CULO 1o. ${"palabra ".repeat(3000)}</p>`;
    const c = chunkNorma(largo, OPC);
    expect(c).toHaveLength(1);
    expect(c[0]?.caracteres).toBeGreaterThan(15_000);
  });

  it("las estadísticas detectan ids duplicados", () => {
    const c = chunkNorma(LEY, OPC);
    expect(estadisticas(c).idsDuplicados).toEqual([]);
    expect(estadisticas([...c, c[0] as never]).idsDuplicados).toEqual(["ley:1616:2013:art:1"]);
  });
});

describe("R2 — la frase sin cita válida se elimina", () => {
  const chunks = ["ley:1616:2013:art:1", "ley:2460:2025:art:3"];

  it("una frase bien citada se publica", () => {
    const r = validarCitas(
      [{ texto: "El artículo 1 fue modificado.", citas: ["ley:2460:2025:art:3"] }],
      chunks,
    );
    expect(r.publicables).toHaveLength(1);
    expect(r.eliminadas).toEqual([]);
  });

  it("una frase SIN cita se elimina — no se marca, se quita", () => {
    const r = validarCitas([{ texto: "Suena razonable.", citas: [] }], chunks);
    expect(r.publicables).toEqual([]);
    expect(r.eliminadas[0]?.motivo).toBe("sin cita");
  });

  /**
   * LA SEÑAL DE ALUCINACIÓN. Una cita a un chunk que no existe es el modelo
   * inventando una referencia — el fallo más caro, porque parece verificable.
   */
  it("una cita a un chunk inexistente tumba la frase y se reporta", () => {
    const r = validarCitas(
      [{ texto: "Según el artículo 99.", citas: ["ley:9999:2099:art:99"] }],
      chunks,
    );
    expect(r.publicables).toEqual([]);
    expect(r.citasFantasma).toEqual(["ley:9999:2099:art:99"]);
  });

  /**
   * Una cita fantasma junto a una buena NO se publica: le daría al lector una
   * referencia que no puede comprobar, mezclada con otra que sí.
   */
  it("de una frase mixta se conservan solo las citas válidas", () => {
    const r = validarCitas(
      [{ texto: "Mixta.", citas: ["ley:1616:2013:art:1", "ley:0000:1900:art:1"] }],
      chunks,
    );
    expect(r.publicables[0]?.citas).toEqual(["ley:1616:2013:art:1"]);
    expect(r.citasFantasma).toEqual(["ley:0000:1900:art:1"]);
  });

  /**
   * Citar un chunk que existe en la base pero NO se le pasó al modelo es igual
   * de sospechoso: significa que lo produjo de memoria, no de la evidencia.
   */
  it("solo valen los chunks que ENTRARON en el contexto", () => {
    const r = validarCitas(
      [{ texto: "De memoria.", citas: ["ley:100:1993:art:163"] }],
      chunks, // existe en el corpus, pero no se le dio
    );
    expect(r.publicables).toEqual([]);
  });

  it("la tasa de supervivencia mide si el retrieval sirve", () => {
    const r = validarCitas(
      [
        { texto: "a", citas: ["ley:1616:2013:art:1"] },
        { texto: "b", citas: [] },
        { texto: "c", citas: ["ley:2460:2025:art:3"] },
        { texto: "d", citas: ["fantasma"] },
      ],
      chunks,
    );
    expect(r.tasaSupervivencia).toBe(0.5);
  });

  /**
   * Una respuesta a la que se le cayó la mitad de las frases no es «un poco
   * peor»: tiene agujeros, y los agujeros no se ven. Lo honesto es no responder.
   */
  it("por debajo del umbral no se publica la respuesta entera", () => {
    const mala = validarCitas(
      [
        { texto: "a", citas: ["ley:1616:2013:art:1"] },
        { texto: "b", citas: [] },
      ],
      chunks,
    );
    expect(puedePublicarse(mala)).toBe(false);

    const buena = validarCitas([{ texto: "a", citas: ["ley:1616:2013:art:1"] }], chunks);
    expect(puedePublicarse(buena)).toBe(true);
  });

  it("una respuesta vacía tampoco se publica", () => {
    expect(puedePublicarse(validarCitas([], chunks))).toBe(false);
  });
});

describe("artículos añadidos por una reforma: 36A no es 36", () => {
  const CON_SUFIJO = `
<p>ART&Iacute;CULO 36. SISTEMA DE INFORMACI&Oacute;N. Texto del artículo original.</p>
<p>ART&Iacute;CULO 36A. OBJETIVOS DEL SISTEMA. Artículo adicionado por la reforma.</p>
<p>ART&Iacute;CULO 37. Otra cosa.</p>`;

  /**
   * MEDIDO EN LA LEY 1616 DE 2013, y es el caso que lo destapó: la reforma de
   * 2025 le añadió un artículo 36A. Capturando solo los dígitos, `36A` colapsa
   * con `36` — dos artículos DISTINTOS con el mismo id de chunk.
   *
   * Una cita ambigua es peor que una que falta: la que falta se ve, la ambigua
   * PARECE resolver, y el lector que la sigue puede acabar leyendo otro
   * artículo del que se le citó.
   */
  it("36 y 36A producen ids distintos", () => {
    const c = chunkNorma(CON_SUFIJO, OPC);
    const ids = c.map((x) => x.id);
    expect(ids).toEqual(["ley:1616:2013:art:36", "ley:1616:2013:art:36a", "ley:1616:2013:art:37"]);
    expect(estadisticas(c).idsDuplicados).toEqual([]);
  });

  it("la referencia citable conserva la letra", () => {
    const c = chunkNorma(CON_SUFIJO, OPC);
    expect(c[1]?.referencia).toBe("Ley 1616 de 2013, artículo 36A");
  });

  it("un artículo sin sufijo no se inventa uno", () => {
    const c = chunkNorma(CON_SUFIJO, OPC);
    expect(c[0]?.referencia).toBe("Ley 1616 de 2013, artículo 36");
  });
});
