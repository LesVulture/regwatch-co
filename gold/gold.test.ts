/**
 * El gold set, verificado contra los datos reales.
 *
 * Dos cosas distintas se comprueban aquí, y la segunda es la que importa:
 *
 * 1. Que el fichero esté bien formado (ids únicos, tipos válidos, anclas).
 * 2. Que las CIFRAS de las respuestas esperadas sigan siendo ciertas contra el
 *    artefacto del colector.
 *
 * Sin (2), un gold set envejece en silencio: las respuestas «correctas» dejan de
 * serlo, el sistema empieza a fallar preguntas que acierta, y nadie sabe si el
 * fallo es del sistema o del gold set. Con (2), el propio test dice cuál de los
 * dos se movió.
 *
 * Si no hay artefacto (no se ha corrido `pnpm collect:senado`), las
 * comprobaciones de cifras se SALTAN declarándolo. Saltar diciéndolo es
 * honesto; pasar en verde sin haber comprobado nada, no.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { categorizarGold } from "./run-gold.ts";

const TIPOS = ["factual", "negacion", "premisa_falsa", "rechazo", "multi_hop", "trampa_temporal"];

interface Pregunta {
  id: string;
  tipo: string;
  volatil: boolean;
  pregunta: string;
  respuesta_esperada: string;
  ancla?: string;
  por_que_rompe?: string;
}

const doc = parse(readFileSync(new URL("./preguntas.yaml", import.meta.url), "utf-8")) as {
  _meta: { version: number; fecha: string; corpus_medido: { proyectos: number } };
  preguntas: Pregunta[];
};

const ART = new URL("../artefactos/senado-pdly.json", import.meta.url);
const hayArtefacto = existsSync(ART);
const proyectos: {
  titulo: string;
  legislatura: string;
  numeroSenadoRaw: string;
  estado: { canonico: string; requiereRevision: boolean };
  crosswalk: { estado: string; residuo: string[] };
}[] = hayArtefacto ? JSON.parse(readFileSync(ART, "utf-8")).proyectos : [];

const conTitulo = (...t: string[]) =>
  proyectos.filter((p) => t.every((x) => p.titulo.toUpperCase().includes(x)));

describe("el gold set está bien formado", () => {
  it("tiene preguntas y todas con id único", () => {
    expect(doc.preguntas.length).toBeGreaterThanOrEqual(15);
    const ids = doc.preguntas.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todos los tipos son de la taxonomía declarada", () => {
    for (const p of doc.preguntas) expect(TIPOS, `${p.id}`).toContain(p.tipo);
  });

  it("cada pregunta declara si es volátil — una cifra de trámite caduca", () => {
    for (const p of doc.preguntas) expect(typeof p.volatil, `${p.id}`).toBe("boolean");
  });

  /**
   * Un gold set de preguntas amables solo mide si el sistema sabe recitar. La
   * mayoría tiene que estar en las categorías donde los sistemas jurídicos
   * fallan de verdad: negar, corregir la premisa y negarse a responder.
   */
  it("la mayoría de las preguntas son de las que rompen, no de las fáciles", () => {
    const duras = doc.preguntas.filter((p) =>
      ["negacion", "premisa_falsa", "rechazo", "trampa_temporal"].includes(p.tipo),
    );
    expect(duras.length / doc.preguntas.length).toBeGreaterThan(0.6);
  });

  it("toda pregunta factual o multi_hop lleva ancla re-verificable", () => {
    for (const p of doc.preguntas) {
      if (p.tipo === "factual" || p.tipo === "multi_hop") {
        expect(p.ancla, `${p.id} sin ancla`).toBeTruthy();
      }
    }
  });
});

describe.skipIf(!hayArtefacto)("las cifras del gold set siguen siendo ciertas", () => {
  /**
   * Remedido 2026-08-21 contra artefactos/senado-pdly.json (collect:senado vivo):
   * 1.693, no 1.694 — 2024-2025 pasó de 471 a 470.
   * Evidencia: docs/verificacion-viva-2026-08-21.md.
   */
  it("el corpus tiene el tamaño que declara el gold set", () => {
    expect(proyectos.length).toBe(doc._meta.corpus_medido.proyectos);
  });

  /** G001: la intersección vacía que motiva todo el proyecto. */
  it("G001 — IA ∩ SALUD sigue siendo vacía", () => {
    expect(conTitulo("INTELIGENCIA ARTIFICIAL", "SALUD")).toEqual([]);
  });

  it("G002 — 13 proyectos de IA: 10 archivados y 3 radicados", () => {
    const ia = conTitulo("INTELIGENCIA ARTIFICIAL");
    expect(ia).toHaveLength(13);
    expect(ia.filter((p) => p.estado.canonico === "archivado")).toHaveLength(10);
    expect(ia.filter((p) => p.estado.canonico === "radicado")).toHaveLength(3);
  });

  it("G004/G005/G006/G018 — las negaciones siguen siendo cero", () => {
    for (const t of ["TELESALUD", "CIBERSEGURIDAD", "BLOCKCHAIN", "CRIPTOMONEDA", "METAVERSO"]) {
      expect(conTitulo(t), `${t} dejó de ser cero`).toEqual([]);
    }
  });

  it("G010 — el proyecto 999 de 2024 sigue sin existir", () => {
    expect(proyectos.filter((p) => p.numeroSenadoRaw.startsWith("999/"))).toEqual([]);
  });

  it("G012 — los conteos de leyes por legislatura cerrada", () => {
    const ley = (leg: string) =>
      proyectos.filter((p) => p.legislatura === leg && p.estado.canonico === "ley").length;
    expect(ley("2022-2023")).toBe(87);
    expect(ley("2023-2024")).toBe(106);
    expect(ley("2024-2025")).toBe(85);
  });

  it("G015 — la cobertura del crosswalk sigue en 37,9 %", () => {
    const n = proyectos.length;
    const cruzados = proyectos.filter((p) =>
      ["declarado", "acumulado"].includes(p.crosswalk.estado),
    ).length;
    expect((cruzados / n) * 100).toBeCloseTo(37.9, 0);
  });

  it("G016 — siguen siendo 2 las filas en cola de revisión humana", () => {
    const revision = proyectos.filter(
      (p) => p.estado.requiereRevision || p.crosswalk.residuo.length > 0,
    );
    expect(revision).toHaveLength(2);
  });
});

describe("categorizarGold — declino_correcto no es vacio", () => {
  const base = {
    publicable: false,
    chunksEnContexto: 0,
    ilegible: null,
    fallosMecanicos: [] as string[],
    error: null,
  };

  it("una negación sin chunks es declino_correcto, no un hueco de corpus", () => {
    expect(categorizarGold("negacion", base)).toBe("declino_correcto");
    expect(categorizarGold("premisa_falsa", base)).toBe("declino_correcto");
    expect(categorizarGold("rechazo", base)).toBe("declino_correcto");
  });

  it("una factual sin chunks es vacio: el corpus no tenía qué citar", () => {
    expect(categorizarGold("factual", base)).toBe("vacio");
    expect(categorizarGold("multi_hop", base)).toBe("vacio");
  });

  it("una factual con chunks que R2 borró es sin_citas, no vacio", () => {
    expect(categorizarGold("factual", { ...base, chunksEnContexto: 4 })).toBe("sin_citas");
  });

  it("publicable gana a las demás", () => {
    expect(categorizarGold("negacion", { ...base, publicable: true, chunksEnContexto: 2 })).toBe(
      "publicable",
    );
  });

  it("trampa_temporal sin chunks es vacio, no declino", () => {
    expect(categorizarGold("trampa_temporal", base)).toBe("vacio");
  });
});
