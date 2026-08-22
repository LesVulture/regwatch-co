/**
 * Dependencias que el plan presupuestó y que ningún colector importa.
 * Dejarlas en package.json era slope: se instalan, no se usan, y el lockfile
 * finge un stack de crawleo que este repo no ejecuta.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PKG = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8")) as {
  main?: string;
  dependencies?: Record<string, string>;
};

describe("collectors/package.json no declara un stack que no se importa", () => {
  it("no trae crawlee, feedsmith, playwright ni unpdf", () => {
    const deps = PKG.dependencies ?? {};
    for (const nombre of ["crawlee", "feedsmith", "playwright", "unpdf"]) {
      expect(deps).not.toHaveProperty(nombre);
    }
  });

  it("no apunta a un main huérfano: no hay src/index.ts", () => {
    expect(PKG.main).toBeUndefined();
  });
});

describe("el cron de recolección no abre fuentes gated", () => {
  it("collect.yml solo invoca Senado, Corte y el piloto", () => {
    const yml = readFileSync(
      new URL("../../.github/workflows/collect.yml", import.meta.url),
      "utf-8",
    );
    expect(yml).toContain("pnpm collect:senado");
    expect(yml).toContain("pnpm collect:corte");
    expect(yml).toContain("pnpm collect:piloto");
    expect(yml).toContain("pnpm g2");
    expect(yml).not.toContain("collect:camara");
    expect(yml).not.toMatch(/camara\.gov|funcionpublica\.gov|dnp\.gov|lasillavacia/i);
  });
});
