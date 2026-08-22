/**
 * Cada caso cita el incidente. Un gold set de fechas inventadas deja de
 * medir; uno anclado a W Radio y al Gestor, no.
 */

import { describe, expect, it } from "vitest";
import { g2Pulso, HOLGURA_CAPTURA, HOLGURA_HECHO, pulsoFallaCorrida } from "./g2-pulso.ts";

const AHORA = "2026-08-21T12:00:00.000Z";

describe("g2 — pulso", () => {
  /**
   * INCIDENTE REAL — feed zombie, W Radio: HTTP 200 + XML válido congelado
   * desde oct-2025. El status no discrimina. Aquí la fuente análoga es
   * senado-pdly (cadencia 24 h): un payload cuya fecha de hecho lleva meses
   * parado, con captura FRESCA, es zombie.
   */
  it("una captura fresca con hechos congelados es zombie, no un 200 sano", () => {
    const v = g2Pulso({
      sourceKey: "senado-pdly",
      fechaHechoMasReciente: "2025-10-01T00:00:00.000Z",
      capturadoEn: "2026-08-21T10:00:00.000Z",
      ahora: AHORA,
    });
    expect(v.outcome).toBe("zombie");
    expect(v.reglaViolada).toBe("hecho-fuera-de-cadencia");
    expect(pulsoFallaCorrida(v)).toBe(true);
    expect(v.horasDesdeHecho).toBeGreaterThan(24 * HOLGURA_HECHO);
  });

  /**
   * INCIDENTE REAL — Gestor `i=53646`, sin refrescar desde 2015-12-01.
   * basedoc declara cadencia semanal; 10 años de silencio la rompen de
   * largo, aunque hubiéramos capturado hoy.
   */
  it("una ficha podrida (años sin hecho) se marca zombie", () => {
    const v = g2Pulso({
      sourceKey: "senado-basedoc",
      fechaHechoMasReciente: "2015-12-01T00:00:00.000Z",
      capturadoEn: AHORA,
      ahora: AHORA,
    });
    expect(v.outcome).toBe("zombie");
    expect(pulsoFallaCorrida(v)).toBe(true);
  });

  it("NUNCA usa el código HTTP: este gate no lo recibe", () => {
    expect(g2Pulso).toHaveLength(1);
    const v = g2Pulso({
      sourceKey: "corte-relatoria",
      fechaHechoMasReciente: "2026-08-20T00:00:00.000Z",
      capturadoEn: "2026-08-21T00:00:00.000Z",
      ahora: AHORA,
    });
    expect(v.outcome).toBe("ok");
    expect(v).not.toHaveProperty("httpStatus");
  });

  /**
   * Senado PDLY no publica fechas en los 9 campos medidos. Inventar una a
   * partir de la legislatura sería el fallo que este proyecto prohíbe. Sin
   * fecha del hecho no hay zombie que marcar; la captura sí se juzga.
   */
  it("sin fecha_del_hecho no se finge un pulso de contenido", () => {
    const v = g2Pulso({
      sourceKey: "senado-pdly",
      fechaHechoMasReciente: null,
      capturadoEn: "2026-08-21T00:00:00.000Z",
      ahora: AHORA,
    });
    expect(v.outcome).toBe("sin_fecha_del_hecho");
    expect(pulsoFallaCorrida(v)).toBe(false);
  });

  it("una captura nuestra fuera de cadencia es pipeline parado, no zombie", () => {
    const v = g2Pulso({
      sourceKey: "senado-pdly",
      fechaHechoMasReciente: null,
      capturadoEn: "2026-08-01T00:00:00.000Z",
      ahora: AHORA,
    });
    expect(v.outcome).toBe("captura_stale");
    expect(v.reglaViolada).toBe("captura-fuera-de-cadencia");
    expect(v.horasDesdeCaptura).toBeGreaterThan(24 * HOLGURA_CAPTURA);
    expect(pulsoFallaCorrida(v)).toBe(true);
  });

  it("una fuente sin cadencia declarada no se da por viva", () => {
    const v = g2Pulso({
      sourceKey: "dnp-conpes",
      fechaHechoMasReciente: "2026-08-01T00:00:00.000Z",
      capturadoEn: AHORA,
      ahora: AHORA,
    });
    expect(v.outcome).toBe("sin_cadencia");
    expect(pulsoFallaCorrida(v)).toBe(false);
  });

  /**
   * La holgura existe por el 87,8 % de bloqueos falsos de una banda de dos
   * caras. Un fin de semana (48 h) sobre cadencia 24 h tiene que pasar:
   * 48 < 24×3. El zombie de W Radio (10 meses) no.
   */
  it("un fin de semana sobre cadencia diaria NO es zombie", () => {
    const v = g2Pulso({
      sourceKey: "corte-relatoria",
      fechaHechoMasReciente: "2026-08-19T12:00:00.000Z",
      capturadoEn: "2026-08-21T10:00:00.000Z",
      ahora: AHORA,
    });
    expect(v.outcome).toBe("ok");
    expect(pulsoFallaCorrida(v)).toBe(false);
  });
});
