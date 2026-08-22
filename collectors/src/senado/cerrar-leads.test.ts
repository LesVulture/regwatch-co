/**
 * El cruce lead → cláusula, sin red y sin prosa de Avance Jurídico.
 *
 * El articulado de abajo es texto OFICIAL de prueba (art. 41 Ley 23 de 1982),
 * la misma forma que `articulado.test.ts`. El lead es un HECHO estructurado,
 * no la nota: ningún campo del lead ni de la candidata puede arrastrar la
 * redacción del editor.
 */

import { describe, expect, it } from "vitest";
import { partirArticulos } from "./articulado.ts";
import type { Lead } from "./basedoc.ts";
import { cerrarLeads, claveNorma } from "./cerrar-leads.ts";

const HTML_2460 = `
<p>ART&Iacute;CULO 3o. Modif&iacute;quese el art&iacute;culo 1o de la Ley 1616 de 2013,
el cual quedar&aacute; as&iacute;: Art&iacute;culo 1o . Objeto . El objeto de la presente
ley es garantizar el ejercicio pleno del Derecho a la Salud Mental.</p>
<p>ART&Iacute;CULO 39. VIGENCIA. La presente ley entrar&aacute; a regir a partir de su
sanci&oacute;n, promulgaci&oacute;n y publicaci&oacute;n en el Diario Oficial y deroga las
disposiciones que le sean contrarias.</p>`;

const LEAD_2460: Lead = {
  unidad: "Artículo",
  tipo: "modifica",
  afectante: { tipo: "Ley", numero: "2460", anio: "2025", articulo: "3" },
  diarioOficial: "53.153",
  fechaDiarioOficial: "2025-06-18",
  reglaVigencia: "publicacion_diario_oficial",
  href: "ley_2460_2025.html#3",
  insRow: 2,
};

const AFECTADA = { tipo: "ley", numero: "1616", anio: 2013 };

function mapa2460() {
  return new Map([
    [
      claveNorma({ tipo: "Ley", numero: "2460", anio: "2025" }),
      {
        identidad: { tipo: "ley", numero: "2460", anio: 2025 },
        articulos: partirArticulos(HTML_2460),
        urlFuente: "http://www.secretariasenado.gov.co/senado/basedoc/ley_2460_2025.html",
        capturedAt: "2026-08-20T00:00:00.000Z",
      },
    ],
  ]);
}

describe("cerrarLeads — el camino 1616 ← 2460, repetible", () => {
  it("cierra el lead con la cláusula de la afectante, no con la nota", () => {
    const r = cerrarLeads(AFECTADA, [LEAD_2460], mapa2460());
    expect(r.huecos).toEqual([]);
    expect(r.candidatas).toHaveLength(1);
    const a = r.candidatas[0];
    expect(a?.tipo).toBe("modifica");
    expect(a?.articulo).toBe("1");
    expect(a?.afectante).toEqual({ tipo: "ley", numero: "2460", anio: 2025 });
    expect(a?.afectada).toEqual(AFECTADA);
    expect(a?.derivation).toBe("declarado_en_norma");
    expect(a?.tier).toBe("primaria");
    expect(a?.textoSoporte).toContain("Modifíquese el artículo 1o de la Ley 1616 de 2013");
    expect(a?.textoSoporte).not.toContain("garantizar el ejercicio pleno");
    expect(a?.fechaEfecto).toBe("2025-06-18");
    expect(a?.fechaDerivation).toBe("derivada_deterministicamente");
    expect(a?.fechaRegla).toContain("Diario Oficial");
    expect(a?.diarioOficial).toBe("53.153");
    expect(a?.urlFuente).toContain("ley_2460_2025");
  });

  /**
   * LA REGLA LEGAL DEL MÓDULO: ni el lead ni la candidata cargan la prosa del
   * editor. Si alguien añade un campo `nota` o pega el HTML de insRow, esto
   * cae. Los hechos (DO, fecha, verbo) sí salen: no son de nadie.
   */
  it("ningún campo de la candidata arrastra prosa editorial", () => {
    const r = cerrarLeads(AFECTADA, [LEAD_2460], mapa2460());
    const serializado = JSON.stringify(r.candidatas);
    expect(serializado).not.toContain("En criterio del editor");
    expect(serializado).not.toContain("Avance Jurídico");
    expect(serializado).not.toContain("por la cual se");
    expect(serializado).not.toContain("Notas de Vigencia");
  });

  it("sin articulado de la afectante el lead queda como hueco, no como arista", () => {
    const r = cerrarLeads(AFECTADA, [LEAD_2460], new Map());
    expect(r.candidatas).toEqual([]);
    expect(r.huecos).toHaveLength(1);
    expect(r.huecos[0]?.motivo).toMatch(/no hay articulado/);
  });

  it("si la afectante no declara esa norma, no se fabrica la arista", () => {
    const r = cerrarLeads({ tipo: "ley", numero: "9999", anio: 2000 }, [LEAD_2460], mapa2460());
    expect(r.candidatas).toEqual([]);
    expect(r.huecos[0]?.motivo).toMatch(/no declara/);
  });
});
