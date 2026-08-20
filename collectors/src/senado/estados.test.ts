import { describe, expect, it } from "vitest";
import { normalizarEstado, normalizarTexto, valoresConocidos } from "./estados.js";

describe("normalizarEstado — los 13 valores medidos en 2 legislaturas", () => {
  it("mapea los estados frecuentes", () => {
    expect(normalizarEstado("ARCHIVADO").canonico).toBe("archivado");
    expect(normalizarEstado("LEY").canonico).toBe("ley");
    expect(normalizarEstado("SANCIÓN PRESIDENCIAL").canonico).toBe("sancion_presidencial");
  });

  /**
   * EL CASO QUE MOTIVA ESTA CAPA. La fuente publica las dos grafías del mismo
   * estado. Sin normalizar, un GROUP BY devuelve dos filas donde hay un hecho.
   */
  it("RADICADO EN CAMARA y RADICADO EN CÁMARA colapsan al mismo estado", () => {
    const sin = normalizarEstado("RADICADO EN CAMARA");
    const con = normalizarEstado("RADICADO EN CÁMARA");
    expect(sin.canonico).toBe("en_camara_revisora");
    expect(con.canonico).toBe("en_camara_revisora");
    expect(sin.canonico).toBe(con.canonico);
  });

  it("distingue archivo por retiro del autor del archivo ordinario", () => {
    expect(normalizarEstado("ARCHIVADO").canonico).toBe("archivado");
    expect(normalizarEstado("ARCHIVADO POR RETIRO DEL AUTOR").canonico).toBe("retirado");
  });

  it("conserva SIEMPRE el original: el matiz administrativo no se pierde", () => {
    const e = normalizarEstado("PENDIENTE DESIGNAR PONENTES EN SENADO");
    expect(e.canonico).toBe("radicado");
    expect(e.original).toBe("PENDIENTE DESIGNAR PONENTES EN SENADO");
  });
});

describe("normalizarEstado — lo desconocido se declara, no se adivina", () => {
  it("un estado nuevo va a revisión en vez de a un cajón «otros»", () => {
    const e = normalizarEstado("PENDIENTE DE ALGO QUE NADIE HA VISTO");
    expect(e.canonico).toBe("desconocido");
    expect(e.requiereRevision).toBe(true);
    expect(e.original).toBe("PENDIENTE DE ALGO QUE NADIE HA VISTO");
  });

  /**
   * Adivinar por prefijo sería tentador y es justo el error: «PENDIENTE …»
   * aparece en cuatro puntos distintos del trámite, de radicado a sanción.
   */
  it("NO adivina por parecido, aunque el prefijo coincida con uno conocido", () => {
    expect(normalizarEstado("PENDIENTE ENVIAR A MARTE").canonico).toBe("desconocido");
  });

  it("vacío, null y undefined requieren revisión y no se confunden con un estado", () => {
    expect(normalizarEstado("").canonico).toBe("desconocido");
    expect(normalizarEstado(null).requiereRevision).toBe(true);
    expect(normalizarEstado(undefined).requiereRevision).toBe(true);
  });

  it("nunca lanza: un estado raro no puede abortar un lote de 471 filas", () => {
    expect(() => normalizarEstado("¡?¿ 🙂")).not.toThrow();
  });
});

describe("normalizarTexto", () => {
  it("quita tildes y homogeneiza espacios", () => {
    expect(normalizarTexto("  Sanción   Presidencial ")).toBe("SANCION PRESIDENCIAL");
  });

  it("el mapa no necesita duplicar entradas con y sin tilde", () => {
    // Si alguien añade "RADICADO EN CÁMARA" al mapa, sobra: normalizarTexto ya
    // lo colapsa. Este test lo hace explícito para que nadie lo "arregle".
    const conTilde = valoresConocidos().filter((k) => /[ÁÉÍÓÚ]/.test(k));
    expect(conTilde).toEqual([]);
  });
});
