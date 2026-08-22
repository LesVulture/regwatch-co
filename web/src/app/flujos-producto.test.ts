/**
 * Flujos de producto en las páginas: búsqueda → vigencia, error visible,
 * y ninguna convención de Next inventada para que un comentario case.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BUSCAR = readFileSync(new URL("./page.tsx", import.meta.url), "utf-8");
const VIGENCIA = readFileSync(
  new URL("./vigencia/[tipo]/[numero]/[anio]/page.tsx", import.meta.url),
  "utf-8",
);

describe("búsqueda", () => {
  it("enlaza normas a /vigencia/{tipo}/{numero}/{anio}", () => {
    expect(BUSCAR).toContain("identidadNorma");
    expect(BUSCAR).toContain("/vigencia/");
  });

  it("muestra frescura de captura, no un proxy.ts vacío", () => {
    expect(BUSCAR).toContain("frescura: rezago respecto de una corrida diaria");
    expect(BUSCAR).toContain("No hay `proxy.ts`");
    expect(BUSCAR).not.toContain("proxy.ts en vez de middleware");
  });
});

describe("vigencia", () => {
  it("un fallo de consulta se enseña, como en búsqueda", () => {
    expect(VIGENCIA).toContain("try {");
    expect(VIGENCIA).toContain("No se pudo consultar");
  });
});
