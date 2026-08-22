import { describe, expect, it } from "vitest";
import { camposFicha, lineaFila, pieFila } from "./consultar.ts";

describe("presentación de filas", () => {
  const fila = {
    origen: "proyecto_ley",
    referencia: "001/26",
    titulo: "Salud mental",
    url_fuente: "http://example.test/x",
    captured_at: "2026-08-20T00:00:00.000Z",
    tier: "primaria",
  };

  it("la procedencia va en la fila, no escondida en el detalle", () => {
    expect(lineaFila(fila)).toContain("proyecto_ley");
    expect(pieFila(fila)).toContain("http://example.test/x");
    expect(pieFila(fila)).toContain("2026-08-20");
  });

  it("la ficha no inventa un timeline: solo campos presentes", () => {
    const t = camposFicha({ titulo: "X", estado: "radicado", id: "uuid" });
    expect(t).toContain("titulo: X");
    expect(t).not.toContain("id:");
    expect(t).not.toMatch(/timeline|tramite_evento/i);
  });
});
