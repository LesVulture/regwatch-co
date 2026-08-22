import { describe, expect, it } from "vitest";
import type { AfectacionCandidata } from "../collectors/src/senado/cerrar-leads.ts";
import { generarSqlAfectaciones } from "./import-afectaciones.ts";

const C: AfectacionCandidata = {
  tipo: "modifica",
  articulo: "1",
  afectante: { tipo: "ley", numero: "2460", anio: 2025 },
  afectada: { tipo: "ley", numero: "1616", anio: 2013 },
  textoSoporte: "ARTÍCULO 3o. Modifíquese el artículo 1o de la Ley 1616 de 2013.",
  fechaEfecto: "2025-06-18",
  fechaDerivation: "derivada_deterministicamente",
  fechaRegla: "rige a partir de su publicación. Diario Oficial No. 53.153 de 2025-06-18.",
  derivation: "declarado_en_norma",
  urlFuente: "http://www.secretariasenado.gov.co/senado/basedoc/ley_2460_2025.html",
  capturedAt: "2026-08-20T00:00:00.000Z",
  tier: "primaria",
  diarioOficial: "53.153",
};

const IDS = {
  afectanteId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  afectadaId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
};

describe("generarSqlAfectaciones", () => {
  it("escribe la cláusula de la ley, no una nota de Avance Jurídico", () => {
    const sql = generarSqlAfectaciones([C], [IDS]).join("\n");
    expect(sql).toContain("Modifíquese el artículo 1o de la Ley 1616 de 2013");
    expect(sql).toContain("'declarado_en_norma'");
    expect(sql).toContain("'primaria'");
    expect(sql).not.toContain("En criterio del editor");
    expect(sql).not.toContain("Avance Jurídico");
  });

  it("borra la arista previa de la misma identidad antes de insertar", () => {
    const [del, ins] = generarSqlAfectaciones([C], [IDS]);
    expect(del).toMatch(/^delete from afectacion/);
    expect(ins).toMatch(/^insert into afectacion/);
  });

  it("rechaza una arista reflexiva en vez de dejarla a la CHECK", () => {
    expect(() =>
      generarSqlAfectaciones([C], [{ afectanteId: IDS.afectanteId, afectadaId: IDS.afectanteId }]),
    ).toThrow(/no_reflexiva/);
  });

  it("fecha no determinable viaja como NULL, no como una fecha plausible", () => {
    const sinFecha: AfectacionCandidata = {
      ...C,
      fechaEfecto: null,
      fechaDerivation: "no_determinable",
      fechaRegla: null,
    };
    const sql = generarSqlAfectaciones([sinFecha], [IDS]).join("\n");
    expect(sql).toContain("NULL::date");
    expect(sql).toContain("'no_determinable'");
  });
});
