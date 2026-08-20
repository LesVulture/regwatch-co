/**
 * Tests del parser de basedoc.
 *
 * **Los fixtures son SINTÉTICOS a propósito, y no es una comodidad: es la misma
 * regla legal que gobierna el módulo.** Guardar notas reales de
 * `secretariasenado.gov.co` como fixture sería persistir la prosa de Avance
 * Jurídico —editorial privada, «Derechos de autor reservados»— que es
 * exactamente lo que §5.2 prohíbe. Los textos de aquí imitan la ESTRUCTURA
 * medida el 2026-08-20 sobre la Ley 1616 de 2013; las palabras son mías.
 *
 * La estructura sí está medida y documentada en `docs/basedoc-estructura.md`.
 */

import { describe, expect, it } from "vitest";
import {
  aTextoPlano,
  esNotaEditorial,
  esTextoOriginal,
  fechaEsPanol,
  parseBasedoc,
  parseNota,
} from "./basedoc.ts";

const NOTA_MODIFICA =
  "<tbody><tr><td><p>- Art&iacute;culo modificado por el art&iacute;culo " +
  "<A href='ley_9999_2025.html#7' >7</A> de la Ley 9999 de 10 de marzo de 2025, " +
  "'por la cual se dictan disposiciones de prueba', publicada en el Diario Oficial " +
  "No. 99.999 de 12 de marzo de 2025. Rige a partir de su publicaci&oacute;n en el " +
  "Diario Oficial.</p></td></tr></tbody>";

const NOTA_ADICIONA =
  "<tbody><tr><td><p>- Par&aacute;grafo adicionado por el art&iacute;culo 4 de la " +
  "Ley 8888 de 1 de febrero de 2024, publicada en el Diario Oficial No. 88.888 de " +
  "3 de febrero de 2024.</p></td></tr></tbody>";

const NOTA_EDITORIAL =
  "<tbody><tr><td><p>En criterio del editor para la interpretaci&oacute;n de este " +
  "art&iacute;culo debe tenerse en cuenta lo dispuesto en el art&iacute;culo 19 de la " +
  "Ley 9999 de 10 de marzo de 2025.</p></td></tr></tbody>";

const TEXTO_ORIGINAL =
  "<tbody><tr><td><p><span class='b_aj'>Texto original de la Ley 1000 de 2010:</span>" +
  "</p><p>ART&Iacute;CULO 1. Disposici&oacute;n de prueba.</p></td></tr></tbody>";

function js(...notas: string[]): string {
  return notas
    .map(
      (n, i) =>
        `function insRow${i + 1}()\n{\nvar description = new Array();\ndescription[0] = "${n}";\n}`,
    )
    .join("\n");
}
const html = (n: number) =>
  `<div id="update_date"><div> &Uacute;ltima actualizaci&oacute;n: 15 de agosto de 2026 - ` +
  `(Diario Oficial No. 53.578 - 5 de agosto de 2026)</div></div>` +
  Array.from({ length: n }, (_, i) => `<span onclick="insRow${i + 1}()"></span>`).join("");

describe("parseNota — el hecho, nunca la prosa", () => {
  it("extrae norma afectante, artículo, Diario Oficial y regla", () => {
    const l = parseNota(NOTA_MODIFICA, 2);
    expect(l?.tipo).toBe("modifica");
    expect(l?.unidad).toBe("Artículo");
    expect(l?.afectante).toEqual({ tipo: "Ley", numero: "9999", anio: "2025", articulo: "7" });
    expect(l?.diarioOficial).toBe("99.999");
    expect(l?.fechaDiarioOficial).toBe("2025-03-12");
    expect(l?.reglaVigencia).toBe("publicacion_diario_oficial");
    expect(l?.href).toBe("ley_9999_2025.html#7");
  });

  /**
   * LA GARANTÍA QUE IMPORTA, y por eso es un test y no un comentario: ningún
   * campo del lead contiene el texto del editor. Si alguien añade uno, esto cae.
   */
  it("NINGÚN campo del lead contiene la prosa de la nota", () => {
    const l = parseNota(NOTA_MODIFICA, 2);
    const serializado = JSON.stringify(l);
    expect(serializado).not.toContain("por la cual se dictan");
    expect(serializado).not.toContain("Rige a partir");
    expect(serializado).not.toContain("modificado por el");
    // Y el conjunto de claves es cerrado: nada de «texto», «nota» o «descripcion».
    expect(Object.keys(l ?? {}).sort()).toEqual([
      "afectante",
      "diarioOficial",
      "fechaDiarioOficial",
      "href",
      "insRow",
      "reglaVigencia",
      "tipo",
      "unidad",
    ]);
  });

  it("distingue la unidad afectada: artículo, parágrafo, inciso…", () => {
    expect(parseNota(NOTA_ADICIONA, 3)?.unidad).toBe("Parágrafo");
    expect(parseNota(NOTA_ADICIONA, 3)?.tipo).toBe("adiciona");
  });

  it("sin cláusula de vigencia, la regla es null y no se inventa", () => {
    expect(parseNota(NOTA_ADICIONA, 3)?.reglaVigencia).toBeNull();
  });

  /**
   * La opinión del editor cita ley y artículo, así que un parser ingenuo la
   * toma por afectación — y mete el juicio de una editorial privada en la
   * cadena de vigencia, que es justo lo que R1 prohíbe.
   */
  it("la OPINIÓN del editor no es una afectación, aunque cite una ley", () => {
    expect(parseNota(NOTA_EDITORIAL, 38)).toBeNull();
    expect(esNotaEditorial(aTextoPlano(NOTA_EDITORIAL))).toBe(true);
  });

  it("el texto original tampoco: es la versión anterior, no un cambio", () => {
    expect(parseNota(TEXTO_ORIGINAL, 9)).toBeNull();
    expect(esTextoOriginal(aTextoPlano(TEXTO_ORIGINAL))).toBe(true);
  });
});

describe("parseBasedoc — la contabilidad tiene que cuadrar", () => {
  it("cada caja acaba en exactamente una categoría", () => {
    const r = parseBasedoc(
      "ley_1000_2010",
      html(4),
      js(NOTA_MODIFICA, NOTA_ADICIONA, NOTA_EDITORIAL, TEXTO_ORIGINAL),
    );
    expect(r.cajasEnJs).toBe(4);
    expect(r.leads).toHaveLength(2);
    expect(r.notasEditoriales).toBe(1);
    expect(r.textosOriginales).toBe(1);
    expect(r.noInterpretadas).toBe(0);
    // La invariante: nada se pierde por el camino.
    expect(r.leads.length + r.notasEditoriales + r.textosOriginales + r.noInterpretadas).toBe(
      r.cajasEnJs,
    );
  });

  it("lee el sello de última actualización y su Diario Oficial", () => {
    const r = parseBasedoc("x", html(1), js(NOTA_MODIFICA));
    expect(r.ultimaActualizacion).toBe("2026-08-15");
    expect(r.diarioOficialSello).toBe("53.578");
  });

  /**
   * EL FALLO SILENCIOSO DE ESTA FUENTE. Las cajas vienen VACÍAS en el HTML; el
   * contenido vive en `js/{slug}.js`. Un colector que solo pida el HTML no
   * falla: devuelve una página perfectamente parseada y SIN vigencia. Por eso
   * los dos conteos salen en el resultado y por eso esto se comprueba.
   */
  it("sin el JS compañero no hay leads, y los conteos lo delatan", () => {
    const r = parseBasedoc("x", html(53), "");
    expect(r.leads).toHaveLength(0);
    expect(r.cajasEnHtml).toBe(53);
    expect(r.cajasEnJs).toBe(0);
    // 53 cajas en el HTML y 0 en el JS: la discrepancia ES la señal.
    expect(r.cajasEnHtml).not.toBe(r.cajasEnJs);
  });

  it("una nota que debería leerse y no se lee cuenta como hueco real", () => {
    const rara = "<p>- Artículo modificado por algo que no se parece a una norma.</p>";
    const r = parseBasedoc("x", html(1), js(rara));
    expect(r.noInterpretadas).toBe(1);
    expect(r.notasEditoriales).toBe(0);
  });
});

describe("fechaEsPanol", () => {
  it("convierte la fecha en español a ISO", () => {
    expect(fechaEsPanol("18 de junio de 2025")).toBe("2025-06-18");
    expect(fechaEsPanol("5 de agosto de 2026")).toBe("2026-08-05");
    expect(fechaEsPanol("1 de enero de 2020")).toBe("2020-01-01");
  });

  it("un mes que no existe devuelve null, no una fecha inventada", () => {
    expect(fechaEsPanol("18 de brumario de 2025")).toBeNull();
    expect(fechaEsPanol("sin fecha")).toBeNull();
  });
});
