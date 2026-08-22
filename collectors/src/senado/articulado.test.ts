/**
 * El paso que convierte un lead en una afectación.
 *
 * Los fixtures reproducen texto OFICIAL de leyes (dominio público, art. 41 de
 * la Ley 23 de 1982), a diferencia de `basedoc.test.ts`, cuyos fixtures son
 * sintéticos porque allí el texto es de una editorial privada. No es la misma
 * regla aplicada distinto: son dos cosas jurídicamente distintas.
 */

import { describe, expect, it } from "vitest";
import {
  clausulaDeAfectacion,
  clausulaVigencia,
  partirArticulos,
  partirArticulosDePaginas,
  reglaEsDeterminista,
} from "./articulado.ts";

// Estructura real de la Ley 2460 de 2025, artículos 3 y 39.
const LEY = `
<p>ART&Iacute;CULO 3o. Modif&iacute;quese el art&iacute;culo 1o de la Ley 1616 de 2013,
el cual quedar&aacute; as&iacute;: Art&iacute;culo 1o . Objeto . El objeto de la presente
ley es garantizar el ejercicio pleno del Derecho a la Salud Mental.</p>
<p>ART&Iacute;CULO 4o. Adici&oacute;nese un par&aacute;grafo al art&iacute;culo 5o de la
Ley 1616 de 2013.</p>
<p>ART&Iacute;CULO 39. VIGENCIA. La presente ley entrar&aacute; a regir a partir de su
sanci&oacute;n, promulgaci&oacute;n y publicaci&oacute;n en el Diario Oficial y deroga las
disposiciones que le sean contrarias.</p>`;

describe("partirArticulos", () => {
  it("resuelve las entidades: buscar ARTÍCULO en el HTML crudo no encuentra nada", () => {
    expect(LEY).toContain("ART&Iacute;CULO");
    expect(partirArticulos(LEY).map((a) => a.numero)).toEqual([3, 4, 39]);
  });

  /**
   * EL BUG QUE CAZÓ LA PRUEBA DE PUNTA A PUNTA. Una ley modificatoria CITA
   * dentro de sí el texto que sustituye: «…quedará así: Artículo 1o. Objeto…».
   * Con búsqueda insensible a mayúsculas, la Ley 2460 de 2025 daba **79
   * artículos donde tiene 39**, y los sobrantes eran texto de OTRA ley colado
   * con el número de esta. No lanza ningún error: se queda ahí.
   */
  it("NO confunde el texto citado de otra ley con un artículo propio", () => {
    const arts = partirArticulos(LEY);
    expect(arts).toHaveLength(3);
    // «Artículo 1o . Objeto» va dentro del 3, citado; no es un artículo propio.
    expect(arts.map((a) => a.numero)).not.toContain(1);
    expect(arts[0]?.texto).toContain("Objeto");
  });
});

describe("clausulaDeAfectacion — el texto_soporte que hace defendible la fila", () => {
  it("lee el verbo declarativo y a quién afecta", () => {
    const art3 = partirArticulos(LEY).find((a) => a.numero === 3);
    const c = clausulaDeAfectacion(art3 as never);
    expect(c?.verbo).toBe("Modifíquese");
    expect(c?.afectada).toEqual({ tipo: "Ley", numero: "1616", anio: "2013" });
    expect(c?.articuloAfectado).toBe(1);
    expect(c?.articuloAfectante).toBe(3);
  });

  /**
   * `texto_soporte` es la PRUEBA, y debe ser la cláusula declarativa — no el
   * artículo entero. Guardar todo metería el texto sustituido dentro de la
   * prueba, que es otra cosa distinta y mucho más larga.
   */
  it("el soporte es la cláusula, no el artículo entero con el texto sustituido", () => {
    const art3 = partirArticulos(LEY).find((a) => a.numero === 3);
    const c = clausulaDeAfectacion(art3 as never);
    expect(c?.textoSoporte).toContain("Modifíquese el artículo 1o de la Ley 1616 de 2013");
    expect(c?.textoSoporte).not.toContain("garantizar el ejercicio pleno");
  });

  it("un artículo que no declara nada devuelve null — es el caso normal", () => {
    const art39 = partirArticulos(LEY).find((a) => a.numero === 39);
    expect(clausulaDeAfectacion(art39 as never)).toBeNull();
  });
});

describe("clausulaVigencia y la derivación de la fecha", () => {
  it("encuentra la cláusula por contenido, no por ser el último artículo", () => {
    const r = clausulaVigencia(partirArticulos(LEY));
    expect(r).toContain("entrará a regir");
    expect(r).toContain("Diario Oficial");
  });

  /**
   * R1 EN UNA FUNCIÓN. Solo es determinista cuando la regla ata la vigencia a
   * la publicación: entonces la fecha es aritmética. Cualquier otra redacción
   * deja la fecha `no_determinable`, que es la respuesta CORRECTA — y la que
   * impide que un LLM la rellene por la puerta de atrás.
   */
  it("solo es determinista si la regla ata la vigencia a la publicación", () => {
    expect(
      reglaEsDeterminista(
        "La presente ley entrará a regir a partir de su publicación en el Diario Oficial.",
      ),
    ).toBe(true);
    expect(reglaEsDeterminista("La presente ley rige a partir de su sanción.")).toBe(true);
  });

  it("una vacatio condicionada NO es determinista, y por eso no da fecha", () => {
    expect(
      reglaEsDeterminista(
        "La presente ley entrará a regir a los seis meses de expedida la reglamentación por el Gobierno Nacional.",
      ),
    ).toBe(false);
    expect(reglaEsDeterminista("Esta ley regirá una vez el Ministerio adopte el plan.")).toBe(
      false,
    );
    expect(reglaEsDeterminista(null)).toBe(false);
  });
});

/**
 * El aparato editorial NO entra en el articulado.
 *
 * Esto no es un test de limpieza: es la regla legal del proyecto convertida en
 * comprobación. El articulado es dominio público (art. 41 de la Ley 23 de
 * 1982); las notas de vigencia, la legislación anterior y «la forma de
 * presentación y disposición de la compilación» las reclama Avance Jurídico
 * como obra propia, en el pie de cada documento.
 *
 * El fallo que motiva estos tests se midió sobre la Ley 1616 de 2013 el
 * 2026-08-20: **21 de 37 chunks contaminados**, y el del artículo 36A se
 * tragaba 1.190 caracteres del aviso de copyright porque el último artículo se
 * extiende hasta el final del fichero. `chunk` es de LECTURA PÚBLICA, así que
 * eso se habría republicado. Tras el saneado: 0 de 37.
 *
 * El marcado de abajo es el REAL, copiado del HTML servido.
 */
describe("soloArticulado — el aparato editorial no es articulado", () => {
  const HTML = [
    '<p><a class="bookmarkaj" name="1">ART&Iacute;CULO 1o. OBJETO.</A>',
    "&lt;Art&iacute;culo modificado por el art&iacute;culo",
    '<A href="ley_2460_2025.html#3" >3</A>',
    "de la Ley 2460 de 2025. El nuevo texto es el siguiente:&gt;",
    "El objeto de la presente ley es garantizar el ejercicio pleno del Derecho.</p>",
    '<div><a class="caja_vja_encabezado" href="javascript:insRow2()">Notas de Vigencia</a></div>',
    '<table id="Table2" class="caja_vja_v" cellPadding=10 width="100%"></table>',
    '<div><a class="caja_vja_encabezado" href="javascript:insRow3()">Legislaci&oacute;n Anterior</a></div>',
    '<table id="Table3" class="caja_vja_la" cellPadding=10 width="100%"></table>',
    '<p><a class="bookmarkaj" name="2">ART&Iacute;CULO 2o. VIGENCIA.</A>',
    "&lt;Ver Notas del Editor&gt; La presente ley rige a partir de su publicaci&oacute;n.</p>",
    '<a href="ley_1616_2013.html#top" title="Ir al inicio"><img src="../images/up_arrow.jpg" alt="Ir al inicio"/></a>',
    '<p style="text-align:center;"><a class=antsig href="ley_1616_2013_pr001.html">Siguiente</a></p>',
    "<!--Fin documento-->",
    '<div id="logo_aj"><div>Disposiciones analizadas por Avance Jur&iacute;dico Casa Editorial S.A.S.&copy;',
    "ISSN [1657-6241] Las notas de vigencia est&aacute;n protegidas por las normas sobre derecho de autor.</div></div>",
  ].join("\n");

  const arts = partirArticulos(HTML);

  it("el bloque de copyright de Avance Jurídico no entra en NINGÚN artículo", () => {
    const todo = arts.map((a) => a.texto).join(" ");
    for (const m of ["Avance Jurídico", "derecho de autor", "ISSN", "Disposiciones analizadas"]) {
      expect(todo, `se coló «${m}»`).not.toContain(m);
    }
  });

  it("los rótulos del editor tampoco", () => {
    const todo = arts.map((a) => a.texto).join(" ");
    for (const m of ["Notas de Vigencia", "Legislación Anterior", "Notas del Editor"]) {
      expect(todo, `se coló «${m}»`).not.toContain(m);
    }
  });

  it("ni la navegación", () => {
    const todo = arts.map((a) => a.texto).join(" ");
    expect(todo).not.toContain("Ir al inicio");
    expect(todo).not.toContain("Siguiente");
  });

  /**
   * Estos dos casos existen porque la verificación por mutación los encontró
   * SIN guardián: en el HTML servido las tablas `caja_` llegan vacías y el
   * ancla «Ir al inicio» solo envuelve un `<img>` que ya se quita antes, así
   * que romper esas dos reglas no cambiaba nada y ningún test se enteraba.
   * Aquí se les da el contenido que tendrían si la fuente lo sirviera —
   * `insRowN()` puebla esas tablas desde el JS acompañante — y entonces las
   * reglas pasan a sostener peso de verdad.
   */
  it("una tabla caja_ POBLADA tampoco entra", () => {
    const conNota = HTML.replace(
      '<table id="Table2" class="caja_vja_v" cellPadding=10 width="100%"></table>',
      '<table id="Table2" class="caja_vja_v"><tr><td>Modificado por la Ley 2460' +
        " de 2025, publicada en el Diario Oficial No. 53.578</td></tr></table>",
    );
    const todo = partirArticulos(conNota)
      .map((a) => a.texto)
      .join(" ");
    expect(todo).not.toContain("Diario Oficial No. 53.578");
    // Y el articulado sigue entero.
    expect(partirArticulos(conNota)).toHaveLength(2);
  });

  it("un ancla de navegación CON texto tampoco entra", () => {
    const conTexto = HTML.replace(
      '<a href="ley_1616_2013.html#top" title="Ir al inicio"><img src="../images/up_arrow.jpg" alt="Ir al inicio"/></a>',
      '<a href="ley_1616_2013.html#top" title="Ir al inicio">Volver arriba</a>',
    );
    const todo = partirArticulos(conTexto)
      .map((a) => a.texto)
      .join(" ");
    expect(todo).not.toContain("Volver arriba");
  });

  /**
   * LA OTRA MITAD, y la más peligrosa: un saneado que se come articulado
   * legítimo trunca la ley en silencio, que es peor que la contaminación.
   */
  it("NO se come el articulado: los dos artículos siguen ahí, enteros", () => {
    expect(arts).toHaveLength(2);
    expect(arts[0]?.designacion).toBe("1");
    expect(arts[0]?.texto).toContain("garantizar el ejercicio pleno del Derecho");
    expect(arts[1]?.designacion).toBe("2");
    expect(arts[1]?.texto).toContain("rige a partir de su publicación");
  });

  /** Decisión legal nombrada: la acotación inline es la voz del compilador. */
  it("quita la acotación inline, y el dato que llevaba es trabajo de basedoc", () => {
    expect(arts[0]?.texto).not.toContain("El nuevo texto es el siguiente");
    expect(arts[0]?.texto).not.toContain("Artículo modificado por");
    // Pero el encabezado real del artículo sobrevive intacto.
    expect(arts[0]?.texto).toContain("ARTÍCULO 1o. OBJETO.");
  });

  it("sin la marca «Fin documento» el pie cae igual, por el div", () => {
    const sinMarca = HTML.replace("<!--Fin documento-->", "");
    const a = partirArticulos(sinMarca);
    expect(a.map((x) => x.texto).join(" ")).not.toContain("Avance Jurídico");
  });
});

/**
 * El fallo del troceador sobre Ley 1581 de 2012 y Ley 1712 de 2014, con
 * marcado de la FORMA real de basedoc — no el texto de esas leyes.
 *
 * README (2026-08-20): 24 ids duplicados + aparato editorial en 1581; 3
 * duplicados y un «artículo» de 19.893 caracteres en 1712. Índice + ancla
 * bookmarkaj + cita `ARTÍCULO N de la Ley` en mayúsculas + paginación
 * `_pr001.html`. El texto de abajo imita esa estructura; las frases son de
 * prueba, no de la compilación.
 */
describe("partirArticulos — índice, ancla y páginas, forma basedoc", () => {
  const INDICE = [
    "<p>ÍNDICE</p>",
    "<p><a href='#1'>ART&Iacute;CULO 1o.</a></p>",
    "<p><a href='#2'>ART&Iacute;CULO 2o.</a></p>",
    "<p><a href='#3'>ART&Iacute;CULO 3o.</a></p>",
  ].join("\n");

  it("no duplica ids ni se traga la ley cuando hay índice + ancla + cita", () => {
    const pagina = [
      INDICE,
      '<p><a class="bookmarkaj" name="1">ART&Iacute;CULO 1o.</A> ART&Iacute;CULO 1o. OBJETO.',
      "El objeto de la presente ley es regular el derecho de acceso a la informaci&oacute;n.</p>",
      '<p><a class="bookmarkaj" name="2">ART&Iacute;CULO 2o.</A> ART&Iacute;CULO 2o. PRINCIPIOS.',
      "La interpretaci&oacute;n de esta ley se sujeta a los principios de transparencia.",
      "Ver ART&Iacute;CULO 5 de la Ley 1581 de 2012 para el h&aacute;beas data.</p>",
      '<p><a class="bookmarkaj" name="3">ART&Iacute;CULO 3o.</A> ART&Iacute;CULO 3o. VIGENCIA.',
      "La presente ley rige a partir de su publicaci&oacute;n.</p>",
      "<!--Fin documento-->",
    ].join("\n");
    const arts = partirArticulos(pagina);
    expect(arts.map((a) => a.designacion)).toEqual(["1", "2", "3"]);
    expect(new Set(arts.map((a) => a.designacion)).size).toBe(3);
    expect(arts[0]?.texto).toContain("acceso a la información");
    expect(arts[0]?.texto).not.toContain("ÍNDICE");
    expect(arts[1]?.texto).toContain("principios de transparencia");
    expect(arts.map((a) => a.designacion)).not.toContain("5");
    expect(arts[1]?.texto).toContain("ARTÍCULO 5 de la Ley 1581");
    expect(Math.max(...arts.map((a) => a.texto.length))).toBeLessThan(5_000);
  });

  /**
   * `soloArticulado` corta en el primer `<!--Fin documento-->`. Concatenar el
   * HTML crudo de la continuación perdería `_pr001.html`. Hay que sanear cada
   * página y unir el texto.
   */
  it("une páginas basedoc sin que Fin documento de la primera se coma la segunda", () => {
    const p1 = [
      INDICE,
      "<p>ART&Iacute;CULO 1o. PRIMERA P&Aacute;GINA. Texto del art&iacute;culo uno.</p>",
      "<!--Fin documento-->",
      '<div id="logo_aj">Avance Jur&iacute;dico</div>',
    ].join("\n");
    const p2 = [
      "<!DOCTYPE html><html><body>",
      "<p>ART&Iacute;CULO 2o. SEGUNDA P&Aacute;GINA. Texto del art&iacute;culo dos.</p>",
      "<!--Fin documento-->",
    ].join("\n");
    expect(partirArticulos(p1).map((a) => a.designacion)).toEqual(["1"]);
    expect(partirArticulosDePaginas([p1, p2]).map((a) => a.designacion)).toEqual(["1", "2"]);
    expect(partirArticulosDePaginas([p1, p2])[1]?.texto).toContain("artículo dos");
    expect(partirArticulos(p1).map((a) => a.designacion)).not.toContain("2");
    expect(partirArticulos(p1).map((a) => a.designacion)).not.toContain("3");
    // Concatenar el crudo es exactamente el fallo: la página 2 cae detrás del corte.
    expect(partirArticulos(p1 + p2).map((a) => a.designacion)).toEqual(["1"]);
  });
});
