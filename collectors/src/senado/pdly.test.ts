/**
 * El colector contra filas REALES de la API del Senado.
 *
 * El fixture no es inventado: son filas de la legislatura 2024-2025 escogidas
 * por el caso que ejercitan (sin crosswalk, acumulación 1:N, los dos estados
 * con y sin tilde, ley sancionada). El resto de los tests fabrica envelopes
 * rotos a propósito — esos SÍ son sintéticos, porque el objetivo es comprobar
 * que el parser los declara en vez de tragárselos.
 */

import { describe, expect, it } from "vitest";
import fixture from "./fixtures/pdly-2024-2025-muestra.json" with { type: "json" };
import { legislaturas, parsePdly, peticionLegislatura } from "./pdly.ts";

const REAL = JSON.stringify(fixture);

describe("parsePdly contra filas reales", () => {
  it("el fixture declara su procedencia", () => {
    expect(fixture._procedencia.fuente).toMatch(/search_pdly\.php/);
    expect(fixture._procedencia.captured_at).toBe("2026-08-20");
    expect(fixture._procedencia.filas_respuesta_completa).toBe(471);
  });

  it("interpreta las filas sin inventarse nada y conserva el crudo", () => {
    const r = parsePdly(REAL);
    expect(r.proyectos).toHaveLength(fixture.data.length);
    for (const p of r.proyectos) {
      // El crudo íntegro sobrevive a la normalización: es la evidencia.
      expect(p.raw).toBeTruthy();
      expect(p.raw.id).toBe(p.id);
      expect(p.numeroSenadoRaw).toBe(p.raw.numero_senado);
    }
  });

  it("los 10 estados reales de la legislatura se reconocen: cero a revisión", () => {
    const r = parsePdly(REAL);
    const desconocidos = r.anomalias.filter((a) => a.clase === "estado-desconocido");
    expect(desconocidos).toEqual([]);
  });

  /** El caso con tilde y el caso sin tilde son el MISMO estado. */
  it("«RADICADO EN CAMARA» y el estado con tilde normalizan sin duplicar", () => {
    const r = parsePdly(REAL);
    const conTilde = r.proyectos.find((p) => p.raw.estado.includes("CÁMARA"));
    const sinTilde = r.proyectos.find((p) => p.raw.estado === "RADICADO EN CAMARA");
    expect(conTilde?.estado.requiereRevision).toBe(false);
    expect(sinTilde?.estado.canonico).toBe("en_camara_revisora");
  });

  it("detecta la acumulación 1:N y no la confunde con un número simple", () => {
    const r = parsePdly(REAL);
    const acum = r.proyectos.find((p) => p.raw.numero_camara.includes("Acum"));
    expect(acum).toBeDefined();
    expect(acum?.crosswalk.estado).toBe("acumulado");
    expect(acum?.crosswalk.acumulados.length).toBeGreaterThanOrEqual(1);
    expect(acum?.crosswalk.contraparte?.canonico).toMatch(/^\d{3}\/\d{2}$/);
  });

  it("un numero_camara vacío es «no declarado», NO un fallo", () => {
    const r = parsePdly(REAL);
    const sin = r.proyectos.find((p) => p.raw.numero_camara === "");
    expect(sin).toBeDefined();
    expect(sin?.crosswalk.estado).toBe("no_declarado");
    expect(sin?.crosswalk.motivo).toBeTruthy(); // el porqué se guarda
    expect(r.anomalias.filter((a) => a.clase === "numero-ilegible")).toEqual([]);
  });
});

describe("parsePdly — lo que sale mal se DECLARA, no se traga", () => {
  /**
   * EL FALLO QUE MOTIVA ESTE MÓDULO. El plan avisa de que `search_lys` topa en
   * 100 filas en silencio. Si `total_results` no cuadra con lo recibido, la
   * respuesta está truncada — y tratarla como completa pierde proyectos sin
   * que nadie se entere.
   */
  it("una respuesta truncada se detecta por total_results", () => {
    const truncada = JSON.stringify({
      success: true,
      data: fixture.data.slice(0, 2),
      total_results: 471,
    });
    const r = parsePdly(truncada);
    const a = r.anomalias.find((x) => x.clase === "total-no-cuadra");
    expect(a).toBeDefined();
    expect(a?.detalle).toContain("471");
    expect(a?.detalle).toContain("truncada");
    // Y aun así devuelve lo que llegó: se reporta, no se aborta.
    expect(r.proyectos).toHaveLength(2);
  });

  it("un campo nuevo o desaparecido en la fuente se reporta", () => {
    const { titulo: _omitido, ...sinTitulo } = fixture.data[0] as Record<string, unknown>;
    const mutada = JSON.stringify({
      success: true,
      data: [{ ...sinTitulo, campo_nuevo: "x" }],
      total_results: 1,
    });
    const a = parsePdly(mutada).anomalias.find((x) => x.clase === "campos-cambiados");
    expect(a?.detalle).toContain("titulo");
    expect(a?.detalle).toContain("campo_nuevo");
  });

  it("success:false se reporta aunque venga con datos", () => {
    const mutada = JSON.stringify({ success: false, data: [], total_results: 0 });
    const a = parsePdly(mutada).anomalias.find((x) => x.clase === "envelope-inesperado");
    expect(a).toBeDefined();
  });

  it("un estado nunca visto va a revisión humana, no a un cajón «otros»", () => {
    const mutada = JSON.stringify({
      success: true,
      data: [{ ...fixture.data[0], estado: "PENDIENTE DE ALGO INÉDITO" }],
      total_results: 1,
    });
    const r = parsePdly(mutada);
    expect(r.proyectos[0]?.estado.canonico).toBe("desconocido");
    expect(r.proyectos[0]?.estado.requiereRevision).toBe(true);
    expect(r.anomalias.some((a) => a.clase === "estado-desconocido")).toBe(true);
  });

  it("un id repetido se declara", () => {
    const mutada = JSON.stringify({
      success: true,
      data: [fixture.data[0], fixture.data[0]],
      total_results: 2,
    });
    expect(parsePdly(mutada).anomalias.some((a) => a.clase === "id-duplicado")).toBe(true);
  });

  it("lanza SOLO cuando no hay nada que normalizar", () => {
    expect(() => parsePdly("<html>error</html>")).toThrow(/no devolvió JSON/);
    expect(() => parsePdly(JSON.stringify({ ok: 1 }))).toThrow(/envelope inesperado/);
    expect(() => parsePdly(JSON.stringify({ data: "no-es-array" }))).toThrow(/no es un array/);
  });
});

describe("ventana multi-legislatura", () => {
  /**
   * Ingerir solo la legislatura activa ROMPE el crosswalk: 111 de 219
   * `numero_camara` de una legislatura no existen en el listado de Cámara de
   * esa misma legislatura. Por eso la ventana es multi-legislatura desde el
   * día 1, y por eso esto es un test y no un comentario.
   */
  it("genera el rango completo, no solo la activa", () => {
    expect(legislaturas(2022, 2026)).toEqual(["2022-2023", "2023-2024", "2024-2025", "2025-2026"]);
  });

  it("un rango inválido falla ruidosamente", () => {
    expect(() => legislaturas(2026, 2020)).toThrow(/rango inválido/);
  });

  it("la petición apunta a la fuente declarada en sources.ts", () => {
    const p = peticionLegislatura("2024-2025");
    expect(p.sourceKey).toBe("senado-pdly");
    expect(p.url).toBe("https://leyes.senado.gov.co/api/search_pdly.php");
    expect(p.form).toEqual({ legislatura: "2024-2025" });
  });
});
