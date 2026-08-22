import { describe, expect, it } from "vitest";
import { hrefDeFila } from "./presentacion.ts";

describe("hrefDeFila", () => {
  it("una norma enlaza a vigencia por la referencia, no por una columna nueva", () => {
    expect(hrefDeFila({ origen: "norma", referencia: "ley 1616 de 2013", id: "uuid" })).toBe(
      "/vigencia/ley/1616/2013",
    );
  });

  it("un proyecto enlaza a su ficha, no se queda en el título plano", () => {
    expect(hrefDeFila({ origen: "proyecto_ley", id: "454ca224-538e-4392-aeef-35f2540da1b1" })).toBe(
      "/proyecto/454ca224-538e-4392-aeef-35f2540da1b1",
    );
  });

  it("una providencia enlaza a su ficha", () => {
    expect(hrefDeFila({ origen: "providencia", id: "454ca224-538e-4392-aeef-35f2540da1b1" })).toBe(
      "/providencia/454ca224-538e-4392-aeef-35f2540da1b1",
    );
  });
});
