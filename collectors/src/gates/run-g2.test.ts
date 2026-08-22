import { describe, expect, it } from "vitest";
import { pulsoDesdeArtefacto } from "./run-g2.ts";

const AHORA = "2026-08-21T12:00:00.000Z";

describe("pulsoDesdeArtefacto", () => {
  it("Senado PDLY no inventa fecha_del_hecho: los 9 campos no la traen", () => {
    const v = pulsoDesdeArtefacto(
      {
        corridas: [{ capturedAt: "2026-08-21T10:00:00.000Z" }],
        proyectos: [{ titulo: "x" }],
      },
      AHORA,
    );
    expect(v.sourceKey).toBe("senado-pdly");
    expect(v.outcome).toBe("sin_fecha_del_hecho");
  });

  it("Corte usa max(fechaPublicacion) como fecha del hecho", () => {
    const v = pulsoDesdeArtefacto(
      {
        corridas: [{ capturedAt: "2026-08-21T10:00:00.000Z" }],
        providencias: [
          { fechaPublicacion: "2026-01-01" },
          { fechaPublicacion: "2026-08-20" },
          { fechaPublicacion: null },
        ],
      },
      AHORA,
    );
    expect(v.sourceKey).toBe("corte-relatoria");
    expect(v.outcome).toBe("ok");
    expect(v.horasDesdeHecho).toBeLessThan(48);
  });

  it("basedoc usa el sello de actualización, no la fecha de nuestra captura", () => {
    const v = pulsoDesdeArtefacto(
      {
        parse: { ultimaActualizacion: "2026-08-15T00:00:00.000Z" },
        _procedencia: { generado: "2026-08-21T10:00:00.000Z" },
      },
      AHORA,
    );
    expect(v.sourceKey).toBe("senado-basedoc");
    expect(v.horasDesdeHecho).toBeGreaterThan(100);
    expect(v.horasDesdeHecho).toBeLessThan(24 * 7 * 3);
    expect(v.outcome).toBe("ok");
  });

  it("un articulado sin sello no inventa fecha_del_hecho", () => {
    const v = pulsoDesdeArtefacto(
      {
        norma: { tipo: "Ley", numero: "1616", anio: 2013 },
        _procedencia: { generado: "2026-08-21T10:00:00.000Z" },
      },
      AHORA,
    );
    expect(v.sourceKey).toBe("senado-basedoc");
    expect(v.outcome).toBe("sin_fecha_del_hecho");
  });
});
