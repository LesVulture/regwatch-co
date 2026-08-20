/**
 * La lista de egreso. Cada caso reproduce una restricción REAL con su norma
 * detrás, no una política inventada.
 */

import { describe, expect, it } from "vitest";
import {
  type ContextoEgreso,
  filtrarRegistro,
  puedeSalir,
  recortarSnippet,
  SNIPPET_MAX,
} from "./politica.ts";

const CONTEXTOS: ContextoEgreso[] = ["ficha_individual", "api_bloque", "dump", "mcp"];

describe("prosa editorial: no sale, y no hay contexto que lo cambie", () => {
  /**
   * «En ningún volumen» es literal. Un umbral —«hasta N palabras»— sería una
   * invitación a discutir dónde está N, y la prohibición no admite esa lectura.
   */
  it("está prohibida en los cuatro contextos", () => {
    for (const c of CONTEXTOS) {
      const v = puedeSalir("prosa_editorial", c);
      expect(v.sale, `salió en ${c}`).toBe(false);
      expect(v.fundamento).toContain("Avance Jurídico");
    }
  });
});

describe("el correo institucional: el MISMO campo, distinto según el contexto", () => {
  /**
   * EL CASO QUE EXPLICA POR QUÉ `contexto` NO ES OPCIONAL. Almacenar y mostrar
   * el correo de UN congresista es legítimo —la Ley 1712 obliga al Estado a
   * publicarlos—; volcar los 181 es otra cosa distinta.
   */
  it("sale en la ficha de una persona", () => {
    const v = puedeSalir("contacto_servidor_publico", "ficha_individual");
    expect(v.sale).toBe(true);
    expect(v.fundamento).toContain("1712");
  });

  it("NO sale en bloque: ni API, ni dump, ni MCP", () => {
    for (const c of ["api_bloque", "dump", "mcp"] as const) {
      const v = puedeSalir("contacto_servidor_publico", c);
      expect(v.sale, `salió en ${c}`).toBe(false);
      expect(v.motivo).toContain("bloque");
    }
  });
});

describe("texto normativo: sale, pero condicionado", () => {
  /**
   * El art. 41 de la Ley 23 de 1982 NO declara dominio público sin más: es una
   * limitación CONDICIONADA. Tratarlo como «es público, hago lo que quiera» es
   * el error que este veredicto evita.
   */
  it("arrastra sus condiciones, no sale a secas", () => {
    const v = puedeSalir("normativo_oficial", "dump");
    expect(v.sale).toBe(true);
    expect(v.fundamento).toContain("art. 41");
    expect(v.condiciones).toContain("debe acompañarse del número de Diario Oficial");
  });

  it("los hechos exigen procedencia comprobable", () => {
    const v = puedeSalir("hecho_metadato", "api_bloque");
    expect(v.sale).toBe(true);
    expect(v.condiciones?.join(" ")).toContain("captured_at");
  });
});

describe("orientación política: sale, y por eso hay que razonarlo", () => {
  /**
   * El art. 5 de la Ley 1581 lista la orientación política entre los datos
   * SENSIBLES y el art. 6 prohíbe tratarlos salvo excepción. La defensa —hecho
   * público inseparable de la función— es sólida, pero el plan exige que quede
   * razonada por escrito. Es justo lo que nadie mira hasta que alguien pregunta.
   */
  it("el veredicto obliga a dejarlo escrito en GOVERNANCE.md", () => {
    const v = puedeSalir("orientacion_politica", "dump");
    expect(v.sale).toBe(true);
    expect(v.fundamento).toContain("SENSIBLE");
    expect(v.condiciones?.join(" ")).toContain("GOVERNANCE.md");
  });
});

describe("prensa: título, medio, fecha, URL y un extracto corto", () => {
  it("nunca el cuerpo completo", () => {
    expect(puedeSalir("prensa", "api_bloque").condiciones).toContain("NUNCA el cuerpo completo");
  });

  it("el extracto se recorta sin partir palabras", () => {
    const largo = `${"palabra ".repeat(200)}final`;
    const r = recortarSnippet(largo);
    expect(r.length).toBeLessThanOrEqual(SNIPPET_MAX + 1);
    expect(r.endsWith("…")).toBe(true);
    expect(r).not.toMatch(/pala…$/);
  });

  it("un texto corto no se toca ni se le añade puntos suspensivos", () => {
    expect(recortarSnippet("Titular breve.")).toBe("Titular breve.");
  });
});

describe("filtrarRegistro trabaja por LISTA BLANCA", () => {
  const congresista = {
    nombre: "Nombre Apellido",
    partido: "Partido X",
    comision: "Primera",
    correo: "alguien@camara.gov.co",
  };
  const proc = {
    nombre: "hecho_metadato",
    partido: "orientacion_politica",
    comision: "hecho_metadato",
    correo: "contacto_servidor_publico",
  } as const;

  it("en una ficha sale todo, incluido el correo", () => {
    const { datos, omitidos } = filtrarRegistro(congresista, proc, "ficha_individual");
    expect(datos.correo).toBe("alguien@camara.gov.co");
    expect(omitidos).toEqual([]);
  });

  it("en un dump se cae el correo y se dice cuál se cayó", () => {
    const { datos, omitidos } = filtrarRegistro(congresista, proc, "dump");
    expect(datos.correo).toBeUndefined();
    expect(datos.nombre).toBe("Nombre Apellido");
    expect(omitidos).toEqual(["correo"]);
  });

  /**
   * LA DECISIÓN DE DISEÑO QUE MÁS IMPORTA. Con lista negra, un campo nuevo
   * saldría por defecto y nadie se enteraría hasta que ya hubiera salido. Con
   * lista blanca, un campo sin procedencia declarada NO sale — el fallo por
   * defecto es callarse, no publicar.
   */
  it("un campo NUEVO sin procedencia declarada no sale", () => {
    const conExtra = { ...congresista, telefono_personal: "300-0000000" };
    const { datos, omitidos } = filtrarRegistro(conExtra, proc, "ficha_individual");
    expect(datos.telefono_personal).toBeUndefined();
    expect(omitidos).toContain("telefono_personal");
  });

  it("un campo de prensa sale recortado, no entero", () => {
    const nota = { cuerpo: `${"x".repeat(5000)}` };
    const { datos } = filtrarRegistro(nota, { cuerpo: "prensa" }, "api_bloque");
    expect(String(datos.cuerpo).length).toBeLessThanOrEqual(SNIPPET_MAX + 1);
  });

  it("la prosa editorial no sale ni declarándola", () => {
    const nota = { nota_vigencia: "texto del editor" };
    const { datos, omitidos } = filtrarRegistro(
      nota,
      { nota_vigencia: "prosa_editorial" },
      "ficha_individual",
    );
    expect(datos.nota_vigencia).toBeUndefined();
    expect(omitidos).toEqual(["nota_vigencia"]);
  });
});
