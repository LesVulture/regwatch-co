import { describe, expect, it } from "vitest";
import { anterior, opcionesDesdeArgv, parsearArgv, siguiente, TIPOS_CICLO } from "./opciones.ts";

describe("parsearArgv", () => {
  it("lee las mismas claves que la URL web", () => {
    const p = parsearArgv([
      "--q=salud",
      "--tipo=proyecto_ley",
      "--legislatura=2026-2027",
      "--estado=en_comision",
      "--camara=senado",
      "--anio=2026",
    ]);
    expect(p).toEqual({
      q: "salud",
      tipo: "proyecto_ley",
      legislatura: "2026-2027",
      estado: "en_comision",
      camara: "senado",
      anio: "2026",
    });
  });

  it("un argumento suelto es la consulta", () => {
    expect(parsearArgv(["salud", "mental"]).q).toBe("salud mental");
  });

  it("ignora flags que la web tampoco entiende", () => {
    expect(parsearArgv(["--tema=salud"]).q).toBeUndefined();
  });
});

describe("opcionesDesdeArgv — el mismo parsearFiltros que la web", () => {
  it("legislatura sin tipo avisa que normas y providencias no salen", () => {
    const r = opcionesDesdeArgv(["--q=x", "--legislatura=2026-2027"]);
    expect(r.opciones.legislatura).toBe("2026-2027");
    expect(r.advertencia).toContain("Normas y providencias no salen");
  });

  it("un estado inventado no entra", () => {
    expect(opcionesDesdeArgv(["--estado=inventado"]).opciones.estado).toBeUndefined();
  });
});

describe("ciclo de filtros en teclado", () => {
  it("siguiente da la vuelta", () => {
    expect(siguiente(TIPOS_CICLO, "")).toBe("proyecto_ley");
    expect(siguiente(TIPOS_CICLO, "norma")).toBe("");
  });

  it("anterior es el inverso", () => {
    expect(anterior(TIPOS_CICLO, "proyecto_ley")).toBe("");
    expect(anterior(TIPOS_CICLO, "")).toBe("norma");
  });
});
