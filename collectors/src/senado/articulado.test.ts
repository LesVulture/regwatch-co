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
