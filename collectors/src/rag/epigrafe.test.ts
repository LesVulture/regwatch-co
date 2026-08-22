/**
 * El epígrafe. Lo que se prueba es dónde CORTA y cuándo se niega a devolver
 * nada — que es lo que impide que `norma.titulo` se rellene con una inferencia.
 */

import { describe, expect, it } from "vitest";
import { extraerEpigrafe } from "./epigrafe.ts";

/** Tal como llega de la compilación: entidades HTML y el rótulo detrás. */
const LEY_1616 =
  "<p>LEY 1616 DE 2013</p><p>Por medio de la cual se expide la ley de Salud Mental " +
  "y se dictan otras disposiciones.</p><p>Resumen de Notas de Vigencia</p>" +
  "<p>EL CONGRESO DE COLOMBIA DECRETA:</p><p>ART&Iacute;CULO 1o. OBJETO.</p>";

const LEY_1098 =
  "<p>Por la cual se expide el C&oacute;digo de la Infancia y la Adolescencia.</p>" +
  "<p>Jurisprudencia Vigencia</p><p>EL CONGRESO DE COLOMBIA DECRETA:</p>";

describe("extraerEpigrafe", () => {
  it("saca el epígrafe con las tildes resueltas", () => {
    expect(extraerEpigrafe(LEY_1616)).toBe(
      "Por medio de la cual se expide la ley de Salud Mental y se dictan otras disposiciones.",
    );
    expect(extraerEpigrafe(LEY_1098)).toBe(
      "Por la cual se expide el Código de la Infancia y la Adolescencia.",
    );
  });

  /**
   * EL CORTE QUE IMPORTA. «Resumen de Notas de Vigencia» es de la compilación,
   * no de la ley. Arrastrarlo metería aparato editorial de un tercero en una
   * columna de lectura pública, que es lo que GOVERNANCE.md prohíbe.
   */
  it("no arrastra el aparato editorial que viene detrás", () => {
    const r = extraerEpigrafe(LEY_1616) ?? "";
    expect(r).not.toContain("Notas de Vigencia");
    expect(r).not.toContain("CONGRESO");
    expect(r).not.toContain("ARTÍCULO");
  });

  it("corta por el rótulo aunque no haya punto que cierre", () => {
    const sinPunto = "<p>Por la cual se dictan normas de transparencia</p><p>Notas de Vigencia</p>";
    expect(extraerEpigrafe(sinPunto)).toBe("Por la cual se dictan normas de transparencia");
  });

  it("acepta las variantes de la fórmula", () => {
    expect(extraerEpigrafe("Por el cual se reglamenta el sector administrativo.")).toContain(
      "se reglamenta",
    );
    expect(extraerEpigrafe("Por medio del cual se adopta el plan de desarrollo.")).toContain(
      "se adopta",
    );
  });

  /**
   * NULL NO ES UN FALLO: es la respuesta correcta cuando no hay título
   * comprobable. Quien llama tiene que negarse a crear la fila, no inventarse
   * «Ley 1616 de 2013» como título.
   */
  it("devuelve null en vez de adivinar", () => {
    expect(extraerEpigrafe("<html><body>Página no encontrada</body></html>")).toBeNull();
    // Demasiado corto para ser un epígrafe.
    expect(extraerEpigrafe("Por la cual sí.")).toBeNull();
    // Demasiado largo: se está tragando el articulado.
    expect(extraerEpigrafe(`Por la cual ${"x".repeat(700)}.`)).toBeNull();
  });

  /**
   * El `<title>` de la compilación NO es el título de la ley, y confundirlos
   * atribuiría a la norma el encabezado de un tercero.
   */
  it("no se conforma con el <title> de la compilación", () => {
    const soloTitle =
      "<title>Leyes desde 1992 - Vigencia expresa y control de constitucionalidad " +
      "[LEY_1616_2013]</title><body>sin epígrafe</body>";
    expect(extraerEpigrafe(soloTitle)).toBeNull();
  });
});

/**
 * LA CLASE DE FALLO QUE ESTE BLOQUE EXISTE PARA CERRAR.
 *
 * Cortar en «el primer punto seguido de espacio» parecía razonable y devolvía
 * títulos truncados que seguían midiendo más que el mínimo, así que se
 * insertaban como válidos en `norma.titulo` —columna `not null`, de lectura
 * pública, indexada por la búsqueda léxica—. Medido sobre 512 páginas reales de
 * basedoc: 6 truncados. «Por la cual se modifica parcialmente la Ley 5a.» ni
 * siquiera dice QUÉ Ley 5a.
 *
 * Cada caso de aquí es una abreviatura que aparece de verdad en epígrafes
 * colombianos, no un supuesto.
 */
describe("extraerEpigrafe — las abreviaturas no cierran frase", () => {
  const epi = (cuerpo: string) => extraerEpigrafe(`<p>${cuerpo}</p>`);

  it.each([
    [
      "Ley 5a. de 1992",
      "Por la cual se modifica parcialmente la Ley 5a. de 1992 y se dictan normas.",
    ],
    [
      "Bogotá, D. C.",
      "Por medio de la cual se aprueba el Acuerdo suscrito en Bogotá, D. C., en 2015.",
    ],
    [
      "la 72a. reunión",
      "Por medio de la cual se aprueba el Convenio adoptado en la 72a. reunión de la OIT.",
    ],
    ["el artículo 3o.", "Por medio de la cual se modifica el artículo 3o. de la Ley 100 de 1993."],
    ["Ley No. 100", "Por medio de la cual se modifica la Ley No. 100 de 1993 y se dictan normas."],
    [
      "vigencia fiscal de 1o.",
      "Por la cual se decreta el presupuesto para la vigencia fiscal de 1o. de enero de 2023.",
    ],
  ])("no trunca en «%s»", (_, texto) => {
    expect(epi(texto)).toBe(texto);
  });

  /**
   * Y el punto que SÍ cierra frase sigue cortando: si esto dejara de cortar, el
   * epígrafe se tragaría el aparato editorial de la compilación, que es lo que
   * GOVERNANCE.md prohíbe republicar.
   */
  it("el punto que cierra frase sigue cortando lo de la compilación", () => {
    const r = epi(
      "Por medio de la cual se expide la ley de Salud Mental. Resumen de Notas de Vigencia: nota 1.",
    );
    expect(r).toBe("Por medio de la cual se expide la ley de Salud Mental.");
  });

  /**
   * Faltaban dos de las tres formas del decretorio, y lo único que impedía que
   * el articulado entero entrara en el título era el corte por punto — la
   * barrera que este cambio deja de sobrecargar. Ahora corta el rótulo.
   */
  it("corta el decretorio en sus tres formas, aunque no haya punto antes", () => {
    for (const d of [
      "EL CONGRESO DE COLOMBIA",
      "EL CONGRESO DE LA REPÚBLICA",
      "EL PRESIDENTE DE LA REPÚBLICA",
    ]) {
      expect(
        epi(`Por la cual se dictan normas sobre transparencia ${d} DECRETA: ARTÍCULO 1o.`),
      ).toBe("Por la cual se dictan normas sobre transparencia");
    }
  });

  /**
   * Sin punto de cierre y sin rótulo que corte no se sabe dónde acaba el
   * epígrafe. Devolver el resto entero sería adivinar el final, que es el mismo
   * pecado que truncarlo por delante.
   */
  it("sin frontera reconocible devuelve null en vez de adivinar el final", () => {
    expect(epi("Por la cual se dictan disposiciones sobre el artículo 5o")).toBeNull();
  });
});
