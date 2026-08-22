import { describe, expect, it } from "vitest";
import {
  ATAJOS_CONSULTA,
  advertenciaFiltros,
  avisoComisionEnBusqueda,
  esUuid,
  etiquetaCampo,
  etiquetaEstado,
  parsearFiltros,
  parsearSearchParams,
} from "./filtros.ts";

describe("parsearFiltros", () => {
  it("ignora valores que el esquema no conoce: no se inventa un estado", () => {
    const r = parsearFiltros({ q: "salud", estado: "tramite-inventado", tipo: "norma" });
    expect(r.opciones.estado).toBeUndefined();
    expect(r.opciones.soloTipo).toBe("norma");
    expect(r.consulta).toBe("salud");
  });

  it("page 2 se vuelve desplazamiento, no un offset a ojo", () => {
    const r = parsearFiltros({ q: "x", page: "2" }, 20);
    expect(r.opciones.desplazamiento).toBe(20);
    expect(r.page).toBe(2);
  });

  it("un año fuera de rango no entra", () => {
    expect(parsearFiltros({ anio: "12" }).opciones.anio).toBeUndefined();
    expect(parsearFiltros({ anio: "2026" }).opciones.anio).toBe(2026);
  });
});

describe("advertenciaFiltros — un filtro que no aplica EXCLUYE, y se dice", () => {
  it("legislatura sin tipo avisa que normas y providencias no salen", () => {
    const a = advertenciaFiltros({ legislatura: "2026-2027" });
    expect(a).toContain("proyectos de ley");
    expect(a).toContain("Normas y providencias no salen");
  });

  it("legislatura + jurisprudencia avisa que no hay candidatos", () => {
    const a = advertenciaFiltros({ legislatura: "2024-2025", soloTipo: "providencia" });
    expect(a).toContain("no hay candidatos");
  });

  it("sin recorte de trámite no hay aviso", () => {
    expect(advertenciaFiltros({ soloTipo: "norma", anio: 2013 })).toBeNull();
  });
});

describe("atajos", () => {
  it("son consultas, no ids de taxonomía", () => {
    expect(ATAJOS_CONSULTA.some((a) => a.q === "inteligencia artificial")).toBe(true);
    expect(ATAJOS_CONSULTA.every((a) => a.q.includes(" ") || a.q.length > 3)).toBe(true);
  });
});

describe("esUuid", () => {
  it("no acepta un id a medias", () => {
    expect(esUuid("454ca224-538e-4392-aeef-35f2540da1b1")).toBe(true);
    expect(esUuid("no-es-uuid")).toBe(false);
  });
});

describe("parsearSearchParams", () => {
  it("toma el primer valor si Next manda un array", () => {
    const r = parsearSearchParams({ q: ["salud", "otra"], tipo: "proyecto_ley" });
    expect(r.consulta).toBe("salud");
    expect(r.opciones.soloTipo).toBe("proyecto_ley");
  });

  it("la comisión entra para el listado", () => {
    expect(parsearFiltros({ comision: "Séptima" }).opciones.comision).toBe("Séptima");
  });
});

describe("avisoComisionEnBusqueda", () => {
  it("con texto se declara que la comisión no recorta el FTS", () => {
    expect(avisoComisionEnBusqueda("Séptima", true)).toContain("no la búsqueda por texto");
    expect(avisoComisionEnBusqueda("Séptima", false)).toBeNull();
  });
});

describe("etiquetas visibles — español de Colombia, no el identificador ASCII", () => {
  it("año y cámara llevan tilde; comisión, eñe", () => {
    expect(etiquetaCampo("anio")).toBe("Año");
    expect(etiquetaCampo("camara")).toBe("Cámara");
    expect(etiquetaCampo("comision")).toBe("Comisión");
    expect(etiquetaCampo("page")).toBe("Página");
    expect(etiquetaEstado("en_comision")).toBe("en comisión");
    expect(etiquetaEstado("conciliacion")).toBe("conciliación");
    expect(etiquetaEstado("sancion_presidencial")).toBe("sanción presidencial");
  });
});
