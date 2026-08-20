/**
 * Las siete variantes de formato de este fichero NO son hipotéticas: salieron
 * de medir las 471 filas de la legislatura 2024-2025 contra la API real del
 * Senado el 2026-08-19. Cada `it` cita su conteo.
 */

import { describe, expect, it } from "vitest";
import { clasificarCrosswalk, parseNumero } from "./crosswalk.ts";

describe("parseNumero — las 7 variantes medidas en 2024-2025", () => {
  it("NNN/NN — el formato normal (213 de 224 casos)", () => {
    const r = parseNumero("211/26");
    expect(r.principal?.canonico).toBe("211/26");
    expect(r.acumulados).toHaveLength(0);
    expect(r.ilegible).toBe(false);
  });

  it("NNN/NNNN — año de cuatro dígitos (4 casos)", () => {
    const r = parseNumero("211/2026");
    // El año se normaliza: 2026 y 26 son el mismo año en esta fuente.
    expect(r.principal?.canonico).toBe("211/26");
  });

  it("NNN/NN Acum NNN/NN — acumulación simple (3 casos)", () => {
    const r = parseNumero("104/24 Acum 155/24");
    expect(r.principal?.canonico).toBe("104/24");
    expect(r.acumulados.map((a) => a.canonico)).toEqual(["155/24"]);
    expect(r.ilegible).toBe(false);
  });

  it("NNN/NN.ACUM.NNN/NN — mayúsculas y puntos como separador (1 caso)", () => {
    const r = parseNumero("104/24.ACUM.155/24");
    expect(r.principal?.canonico).toBe("104/24");
    expect(r.acumulados).toHaveLength(1);
  });

  it("NNN/NN Acumulado NNN/NN — la palabra completa (1 caso)", () => {
    const r = parseNumero("104/24 Acumulado 155/24");
    expect(r.principal?.canonico).toBe("104/24");
    expect(r.acumulados).toHaveLength(1);
  });

  it("acumulación de CINCO proyectos — el caso extremo real (1 caso)", () => {
    const r = parseNumero("093/24 Acum 12/24 - 118/24 - 155/24 - 201/24 - 233/24");
    expect(r.principal?.canonico).toBe("093/24");
    // 1:N, no 1:1. Un JOIN sobre este campo no funciona.
    expect(r.acumulados).toHaveLength(5);
    expect(r.acumulados.map((a) => a.canonico)).toEqual([
      "012/24",
      "118/24",
      "155/24",
      "201/24",
      "233/24",
    ]);
  });

  it("NNN/NN Acum NNN/NN NNN/NN — sin separador entre acumulados (1 caso)", () => {
    const r = parseNumero("104/24 Acum 155/24 201/24");
    expect(r.acumulados).toHaveLength(2);
  });
});

describe("parseNumero — normalización", () => {
  it("rellena ceros a la izquierda para poder comparar", () => {
    expect(parseNumero("1/26").principal?.canonico).toBe("001/26");
    expect(parseNumero("12/26").principal?.canonico).toBe("012/26");
  });

  it("tolera espacios alrededor de la barra", () => {
    expect(parseNumero("211 / 26").principal?.canonico).toBe("211/26");
  });

  it("conserva SIEMPRE el texto original: es la evidencia", () => {
    const r = parseNumero("  104/24.ACUM.155/24  ");
    expect(r.raw).toBe("104/24.ACUM.155/24");
  });
});

describe("parseNumero — lo que NO se interpreta", () => {
  it("campo vacío no es ilegible: es un vacío legítimo y frecuente", () => {
    const r = parseNumero("");
    expect(r.principal).toBeNull();
    expect(r.ilegible).toBe(false);
  });

  it("null y undefined se tratan como vacío", () => {
    expect(parseNumero(null).ilegible).toBe(false);
    expect(parseNumero(undefined).principal).toBeNull();
  });

  /**
   * Un campo con texto que no parece un número de proyecto NO se descarta en
   * silencio. El silencio es el modo de fallo que este proyecto combate.
   */
  it("texto no interpretable se marca ilegible, no se descarta", () => {
    const r = parseNumero("pendiente de radicar");
    expect(r.principal).toBeNull();
    expect(r.ilegible).toBe(true);
  });

  it("varios números SIN declarar acumulación es ilegible, no una relación inventada", () => {
    const r = parseNumero("104/24 155/24");
    expect(r.ilegible).toBe(true);
    expect(r.acumulados).toHaveLength(0);
  });
});

describe("clasificarCrosswalk", () => {
  it("declarado cuando la fuente publica la contraparte", () => {
    const c = clasificarCrosswalk("104/24", "211/24");
    expect(c.estado).toBe("declarado");
    expect(c.contraparte?.canonico).toBe("211/24");
  });

  /**
   * EL CASO MAYORITARIO, y el que tumbó el supuesto del plan: en la
   * legislatura cerrada 2024-2025, 247 de 471 filas (52,4 %) no declaran su
   * contraparte. No es una excepción, es la norma.
   */
  it("no_declarado es el caso mayoritario (52,4 % en 2024-2025)", () => {
    const c = clasificarCrosswalk("104/24", "");
    expect(c.estado).toBe("no_declarado");
    expect(c.contraparte).toBeNull();
    // El motivo se guarda: es procedencia, no un mensaje de log.
    expect(c.motivo).toMatch(/52,4/);
  });

  it("acumulado se distingue de declarado: es 1:N", () => {
    const c = clasificarCrosswalk("104/24", "211/24 Acum 233/24");
    expect(c.estado).toBe("acumulado");
    expect(c.acumulados).toHaveLength(1);
  });

  it("ilegible va a revisión humana con el texto original en el motivo", () => {
    const c = clasificarCrosswalk("104/24", "ver gaceta");
    expect(c.estado).toBe("ilegible");
    expect(c.motivo).toMatch(/ver gaceta/);
  });

  /**
   * NO se resuelven identidades por parecido. Emparejar por título o autor
   * fabricaría relaciones falsas, y publicar «el Senado y la Cámara se
   * contradicen» cuando no es cierto hace más daño que no cruzar nada.
   */
  it("nunca inventa una contraparte cuando la fuente calla", () => {
    const c = clasificarCrosswalk("104/24", null);
    expect(c.contraparte).toBeNull();
    expect(c.estado).toBe("no_declarado");
  });
});

describe("residuo: lo que el parser NO consumió se declara", () => {
  /**
   * EL FALLO QUE ESTO CAZA, y es real: `339/23 ACUM 340,341,344/23` nombra
   * CUATRO proyectos. `340` y `341` van sin `/año`, el regex exige el año, y
   * el resultado era «2 proyectos» — una acumulación 1:N contada de menos, en
   * silencio. Se descubrió mirando el SQL generado, no leyendo el código.
   */
  it("declara los números sin año que no pudo contar", () => {
    const r = parseNumero("339/23 ACUM 340,341,344/23");
    expect(r.principal?.canonico).toBe("339/23");
    expect(r.acumulados.map((a) => a.canonico)).toEqual(["344/23"]);
    // Y lo que NO se contó queda dicho, en vez de desaparecer.
    expect(r.residuo).toEqual(["340", "341"]);
  });

  it("NO infiere el año compartido: 340 no se convierte en 340/23", () => {
    const r = parseNumero("339/23 ACUM 340,341,344/23");
    const canonicos = [r.principal, ...r.acumulados].map((n) => n?.canonico);
    expect(canonicos).not.toContain("340/23");
    expect(canonicos).not.toContain("341/23");
  });

  it("el motivo dice que la acumulación está incompleta", () => {
    const c = clasificarCrosswalk("216/23", "339/23 ACUM 340,341,344/23");
    expect(c.estado).toBe("acumulado");
    expect(c.motivo).toContain("INCOMPLETA");
    expect(c.motivo).toContain("340");
    expect(c.residuo).toEqual(["340", "341"]);
  });

  /** Sin falsos positivos: las acumulaciones bien escritas no se marcan. */
  it("una acumulación con todos los años NO deja residuo", () => {
    expect(parseNumero("023/22 Acum 057/22, 099/22").residuo).toEqual([]);
    expect(parseNumero("093/24 Acum 12/24 - 118/24 - 155/24 - 201/24 - 233/24").residuo).toEqual(
      [],
    );
    expect(clasificarCrosswalk("001/24", "407/24").residuo).toEqual([]);
    expect(clasificarCrosswalk("001/24", "").residuo).toEqual([]);
  });
});
