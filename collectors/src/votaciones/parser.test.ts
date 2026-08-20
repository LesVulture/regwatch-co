import { describe, expect, it } from "vitest";
import { contrastarTotales, normalizarSentido, parseVotacion, parseVotos } from "./parser.ts";

const ACTA = `
CEPEDA SARABIA EFRAÍN JOSÉ ......... SÍ
BLEL SCAFF NADIA GEORGETTE ......... SÍ
PACHÓN ACHURY CÉSAR AUGUSTO ........ NO
AVELLA ESQUIVEL AIDA YOLANDA ....... ABSTENCIÓN
NAME CARDOZO JOSÉ DAVID ............ AUSENTE
`;

describe("normalizarSentido — no se adivina", () => {
  it("reconoce las formas reales, con y sin tilde", () => {
    expect(normalizarSentido("SÍ")).toBe("si");
    expect(normalizarSentido("si")).toBe("si");
    expect(normalizarSentido("ABSTENCIÓN")).toBe("abstencion");
    expect(normalizarSentido("No votó")).toBe("ausente");
    expect(normalizarSentido("IMPEDIDO")).toBe("impedido");
  });

  /**
   * UN OCR QUE LEE «S1» EN VEZ DE «SÍ» NO PRODUCE UN «SÍ». Adivinar aquí es
   * inventarle un voto a una persona identificada — el error más caro que este
   * proyecto puede cometer, porque las consecuencias son de un tercero y no de
   * quien lo comete.
   */
  it("un sentido mal leído NO se convierte en el parecido", () => {
    expect(normalizarSentido("S1")).toBeNull();
    expect(normalizarSentido("N0")).toBeNull();
    expect(normalizarSentido("")).toBeNull();
    expect(normalizarSentido("SÍI")).toBeNull();
  });
});

describe("parseVotos", () => {
  it("lee nombre y sentido de cada línea", () => {
    const { votos } = parseVotos(ACTA);
    expect(votos).toHaveLength(5);
    expect(votos[0]?.congresista).toBe("CEPEDA SARABIA EFRAÍN JOSÉ");
    expect(votos[0]?.sentido).toBe("si");
    expect(votos[2]?.sentido).toBe("no");
  });

  it("conserva el texto crudo: es la prueba frente al OCR", () => {
    const { votos } = parseVotos(ACTA);
    for (const v of votos) expect(v.crudo).toContain(v.congresista);
  });

  it("un sentido ilegible se declara con el nombre, no se descarta callando", () => {
    const { votos, anomalias } = parseVotos("PEREZ JUAN ......... S1\n");
    expect(votos).toEqual([]);
    expect(anomalias[0]?.clase).toBe("sentido-ilegible");
    expect(anomalias[0]?.detalle).toContain("PEREZ JUAN");
  });

  it("un nombre repetido se declara", () => {
    const { anomalias } = parseVotos("PEREZ JUAN ... SÍ\nPEREZ JUAN ... NO\n");
    expect(anomalias.some((a) => a.clase === "duplicado")).toBe(true);
  });
});

describe("el contraste con los totales del acta", () => {
  /**
   * LA REGLA QUE SOSTIENE EL MÓDULO. El acta imprime sus propios totales. Si la
   * suma de lo leído no coincide, algo se leyó mal — y NO SE SABE QUÉ.
   *
   * Publicar 106 votos de los que 105 son correctos es peor que no publicar
   * ninguno: el incorrecto le atribuye a una persona algo que no hizo, y nadie
   * sabe cuál es.
   */
  it("si los totales cuadran, los votos individuales se publican", () => {
    const v = parseVotacion(ACTA, { si: 2, no: 1, abstencion: 1, ausente: 1 });
    expect(v.publicable).toBe(true);
    expect(v.anomalias).toEqual([]);
  });

  it("si NO cuadran, los individuales NO se publican", () => {
    const v = parseVotacion(ACTA, { si: 3, no: 1, abstencion: 1, ausente: 1 });
    expect(v.publicable).toBe(false);
    expect(v.anomalias.some((a) => a.clase === "total-no-cuadra")).toBe(true);
    // Pero los totales DECLARADOS sí se conservan: es lo que dice el documento.
    expect(v.totalesDeclarados).toEqual({ si: 3, no: 1, abstencion: 1, ausente: 1 });
  });

  it("el detalle dice qué declaró el acta y qué se leyó", () => {
    const { anomalias } = contrastarTotales(parseVotos(ACTA).votos, { si: 3 });
    expect(anomalias[0]?.detalle).toContain("declara 3");
    expect(anomalias[0]?.detalle).toContain("leyeron 2");
  });

  /**
   * Sin totales no hay forma de detectar un error de lectura, así que tampoco
   * se publica. «No pude comprobarlo» y «lo comprobé y está bien» no son lo
   * mismo, y aquí la diferencia le cuesta a un tercero.
   */
  it("sin totales que contrastar, tampoco se publica", () => {
    const v = parseVotacion(ACTA, null);
    expect(v.publicable).toBe(false);
    expect(v.anomalias[0]?.detalle).toContain("sin contraste");
  });

  /**
   * Un sentido ilegible bloquea aunque los totales cuadren: significa que
   * alguien votó y no sabemos qué, así que la lista está incompleta.
   */
  it("un ilegible bloquea aunque los totales cuadren", () => {
    const v = parseVotacion(`${ACTA}RIOS CUELLAR LORENA ......... S1\n`, {
      si: 2,
      no: 1,
      abstencion: 1,
      ausente: 1,
    });
    expect(v.publicable).toBe(false);
  });
});
