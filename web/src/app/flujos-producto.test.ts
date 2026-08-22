import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BUSCAR = readFileSync(new URL("./page.tsx", import.meta.url), "utf-8");
const LISTA = readFileSync(new URL("../components/lista-resultados.tsx", import.meta.url), "utf-8");
const PRES = readFileSync(new URL("../lib/presentacion.ts", import.meta.url), "utf-8");
const VIGENCIA = readFileSync(
  new URL("./vigencia/[tipo]/[numero]/[anio]/page.tsx", import.meta.url),
  "utf-8",
);
const PROYECTO = readFileSync(new URL("./proyecto/[id]/page.tsx", import.meta.url), "utf-8");
const COBERTURA = readFileSync(new URL("./cobertura/page.tsx", import.meta.url), "utf-8");

describe("búsqueda", () => {
  it("enlaza normas a /vigencia/{tipo}/{numero}/{anio}", () => {
    expect(PRES).toContain("identidadNorma");
    expect(PRES).toContain("/vigencia/");
  });

  it("muestra frescura de captura, no un proxy.ts vacío", () => {
    expect(LISTA).toContain("frescura: rezago respecto de una corrida diaria");
    expect(BUSCAR).toContain("No hay `proxy.ts`");
    expect(BUSCAR).not.toContain("proxy.ts en vez de middleware");
  });

  it("los atajos rellenan q, no un id de taxonomía", () => {
    expect(BUSCAR).toMatch(/atajo/i);
    expect(BUSCAR).toContain("taxonomía");
  });
});

describe("vigencia", () => {
  it("un fallo de consulta se enseña, como en búsqueda", () => {
    expect(VIGENCIA).toContain("try {");
    expect(VIGENCIA).toContain("No se pudo consultar");
  });

  it("la fecha de consulta viaja en la URL", () => {
    expect(VIGENCIA).toContain('type="date"');
    expect(VIGENCIA).toContain('name="fecha"');
  });
});

describe("fichas y cobertura", () => {
  it("no inventa un timeline de trámite", () => {
    expect(PROYECTO).toContain("tramite_evento");
    expect(PROYECTO).toContain("no se inventa un timeline");
  });

  it("declara la cobertura real, no un dashboard", () => {
    expect(COBERTURA).toContain("AUTORIZACION.concedida = false");
    expect(COBERTURA).toContain("7 normas con articulado");
    expect(COBERTURA).toContain("CONPES");
  });
});
