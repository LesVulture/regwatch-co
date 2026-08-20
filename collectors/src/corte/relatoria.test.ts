/**
 * El colector de la relatoría contra datos REALES de la Corte.
 *
 * El fixture son registros auténticos —uno de cada tipo de providencia— del
 * índice del 2026-08-20. Aquí sí se guardan íntegros, a diferencia de basedoc:
 * la Corte Constitucional es entidad estatal y sus providencias son documentos
 * oficiales, no la compilación con copyright de una editorial privada.
 */

import { describe, expect, it } from "vitest";
import fixture from "./fixtures/relatoria-2026-muestra.json" with { type: "json" };
import { MAXPROV, parseRelatoria, peticionAnio, TIPOS_PROVIDENCIA, urlTexto } from "./relatoria.ts";

const REAL = JSON.stringify(fixture);

describe("parseRelatoria contra registros reales", () => {
  it("el fixture declara su procedencia", () => {
    expect(fixture._procedencia.fuente).toMatch(/buscador_new/);
    expect(fixture._procedencia.captured_at).toBe("2026-08-20");
    expect(fixture._procedencia.providencias_respuesta_completa).toBe(1141);
  });

  it("lee las providencias de data.hits.hits, no de la raíz", () => {
    const r = parseRelatoria(REAL);
    expect(r.providencias.length).toBe(fixture.data.hits.hits.length);
    expect(r.anomalias).toEqual([]);
  });

  it("cubre los 4 tipos medidos y ninguno sale como desconocido", () => {
    const r = parseRelatoria(REAL);
    const tipos = new Set(r.providencias.map((p) => p.tipo));
    expect([...tipos].sort()).toEqual([...TIPOS_PROVIDENCIA].sort());
    expect(r.providencias.filter((p) => p.tipoDesconocido)).toEqual([]);
  });

  it("resuelve la URL del texto completo para todas", () => {
    const r = parseRelatoria(REAL);
    for (const p of r.providencias) {
      expect(p.urlTexto, `${p.sentencia}`).toMatch(
        /^https:\/\/www\.corteconstitucional\.gov\.co\/relatoria\/.+\.htm$/,
      );
    }
  });

  it("conserva el registro crudo íntegro", () => {
    const r = parseRelatoria(REAL);
    for (const p of r.providencias) {
      expect(p.raw.prov_id).toBe(p.id);
      expect(p.raw.rutahtml).toBeTruthy();
    }
  });
});

describe("lo que sale mal se declara", () => {
  const uno = fixture.data.hits.hits[0] as { _source: Record<string, unknown> };

  const envolver = (hits: unknown[], total = hits.length) =>
    JSON.stringify({ data: { hits: { total: { value: total }, hits } }, parametros: {} });

  /**
   * `maxprov` trunca sin avisar. Si `hits.total.value` no cuadra con lo
   * recibido, faltan providencias y hay que saberlo.
   */
  it("detecta el truncamiento comparando total contra lo recibido", () => {
    const r = parseRelatoria(envolver([uno], 1141));
    const a = r.anomalias.find((x) => x.clase === "total-no-cuadra");
    expect(a?.detalle).toContain("1141");
    expect(a?.detalle).toContain("maxprov");
    expect(r.providencias).toHaveLength(1); // devuelve lo que llegó
  });

  it("un tipo de providencia nuevo se marca, no aborta el año", () => {
    const raro = { _source: { ...uno._source, prov_tipo: "Concepto insólito", prov_id: 999001 } };
    const r = parseRelatoria(envolver([raro]));
    expect(r.providencias[0]?.tipoDesconocido).toBe(true);
    expect(r.anomalias.some((a) => a.clase === "tipo-desconocido")).toBe(true);
  });

  it("sin rutahtml no hay texto que pedir, y se dice", () => {
    const sinRuta = { _source: { ...uno._source, rutahtml: "", prov_id: 999002 } };
    const r = parseRelatoria(envolver([sinRuta]));
    expect(r.providencias[0]?.urlTexto).toBeNull();
    expect(r.anomalias.some((a) => a.clase === "sin-rutahtml")).toBe(true);
  });

  it("una fecha ilegible se declara en vez de normalizarse a la fuerza", () => {
    const mala = { _source: { ...uno._source, prov_f_public: "19/08/2026", prov_id: 999003 } };
    const r = parseRelatoria(envolver([mala]));
    expect(r.providencias[0]?.fechaPublicacion).toBeNull();
    expect(r.anomalias.some((a) => a.clase === "fecha-ilegible")).toBe(true);
  });

  it("un prov_id repetido se declara", () => {
    const r = parseRelatoria(envolver([uno, uno]));
    expect(r.anomalias.some((a) => a.clase === "id-duplicado")).toBe(true);
  });

  /** La envoltura es la trampa: `hits` NO está en la raíz. */
  it("lanza si el envelope no trae data.hits.hits", () => {
    expect(() => parseRelatoria(JSON.stringify({ hits: { hits: [] } }))).toThrow(
      /data\.hits\.hits/,
    );
    expect(() => parseRelatoria("<div class='alert-danger'>")).toThrow(/no devolvió JSON/);
  });
});

describe("urlTexto — se guarda rutahtml, no se deriva", () => {
  it("resuelve las formas reales de ruta", () => {
    expect(urlTexto("Autos/2026/A1126-26.htm")).toBe(
      "https://www.corteconstitucional.gov.co/relatoria/Autos/2026/A1126-26.htm",
    );
    expect(urlTexto("2026/T-246-26.htm")).toBe(
      "https://www.corteconstitucional.gov.co/relatoria/2026/T-246-26.htm",
    );
  });

  it("vacío o ausente devuelve null, no una URL inventada", () => {
    expect(urlTexto("")).toBeNull();
    expect(urlTexto(undefined)).toBeNull();
    expect(urlTexto(null)).toBeNull();
  });
});

describe("peticionAnio", () => {
  it("construye el backfill de un año con maxprov bajo el techo medido", () => {
    const p = peticionAnio(2025);
    expect(p.sourceKey).toBe("corte-relatoria");
    expect(p.url).toContain("fini=2025-01-01");
    expect(p.url).toContain("ffin=2025-12-31");
    expect(p.url).toContain(`maxprov=${MAXPROV}`);
    // 10001 devuelve un fragmento de error con HTTP 200. No acercarse.
    expect(MAXPROV).toBeLessThan(10_001);
  });
});
