import { describe, expect, it } from "vitest";
import type { Chunk } from "./chunking.ts";
import { construirBloques, extraerFrases, procesarRespuesta, SISTEMA } from "./qa.ts";

const chunk = (id: string, ref: string, texto = "texto"): Chunk => ({
  id,
  fuente: "norma",
  referencia: ref,
  texto,
  caracteres: texto.length,
  urlFuente: "http://x/y.html",
  capturedAt: "2026-08-20T00:00:00.000Z",
});

const CHUNKS = [
  chunk("ley:1616:2013:art:1", "Ley 1616 de 2013, artículo 1"),
  chunk("ley:2460:2025:art:3", "Ley 2460 de 2025, artículo 3"),
];

describe("bloques search_result", () => {
  /**
   * POR QUÉ NO `document` (§8.2): con bloques `document`, validar que una cita
   * resuelva a un chunk obliga a reconstruir la identidad desde
   * `document_index` + offsets, con un mapa paralelo que se desincroniza si
   * cambia el orden del request — y se desincroniza EN SILENCIO: las citas
   * siguen resolviendo, al chunk equivocado.
   */
  it("el chunk_id viaja en `source`, así que vuelve dentro de la cita", () => {
    const b = construirBloques(CHUNKS);
    expect(b[0]?.type).toBe("search_result");
    expect(b[0]?.source).toBe("ley:1616:2013:art:1");
    expect(b[0]?.title).toBe("Ley 1616 de 2013, artículo 1");
    expect(b[0]?.citations.enabled).toBe(true);
  });

  /**
   * `source` se compara; `title` se muestra. Si la referencia legible fuera el
   * `source`, la validación dependería de cómo se redacta un título.
   */
  it("source e id son lo mismo; title es otra cosa", () => {
    const b = construirBloques(CHUNKS);
    expect(b.map((x) => x.source)).toEqual(CHUNKS.map((c) => c.id));
    expect(b[0]?.source).not.toBe(b[0]?.title);
  });
});

describe("extraerFrases", () => {
  it("recoge el texto y los source de cada cita", () => {
    const f = extraerFrases([
      {
        type: "text",
        text: "El artículo 1 fue modificado.",
        citations: [{ type: "search_result_location", source: "ley:2460:2025:art:3" }],
      },
    ]);
    expect(f[0]?.citas).toEqual(["ley:2460:2025:art:3"]);
  });

  /**
   * Un bloque SIN citas se conserva con la lista vacía para que `validarCitas`
   * lo elimine y lo cuente. Descartarlo aquí escondería cuánta respuesta venía
   * sin apoyo, que es la métrica que interesa.
   */
  it("el texto sin citas no se descarta aquí: se pasa para que se cuente", () => {
    const f = extraerFrases([{ type: "text", text: "Suena bien.", citations: null }]);
    expect(f).toHaveLength(1);
    expect(f[0]?.citas).toEqual([]);
  });

  it("ignora bloques que no son de texto y los vacíos", () => {
    expect(
      extraerFrases([
        { type: "thinking", text: "…" },
        { type: "text", text: "   " },
      ]),
    ).toEqual([]);
  });
});

describe("procesarRespuesta — de punta a punta", () => {
  it("publica lo citado y arma las referencias legibles", () => {
    const r = procesarRespuesta(
      [
        {
          type: "text",
          text: "El artículo 1 fue modificado en 2025.",
          citations: [{ source: "ley:2460:2025:art:3" }],
        },
      ],
      CHUNKS,
    );
    expect(r.texto).toBe("El artículo 1 fue modificado en 2025.");
    expect(r.referencias).toEqual(["Ley 2460 de 2025, artículo 3"]);
  });

  it("una frase inventada se cae y no llega al texto", () => {
    const r = procesarRespuesta(
      [
        { type: "text", text: "Con cita.", citations: [{ source: "ley:1616:2013:art:1" }] },
        { type: "text", text: "Sin cita, pero convincente.", citations: null },
      ],
      CHUNKS,
    );
    expect(r.texto).toBe("Con cita.");
    expect(r.texto).not.toContain("convincente");
    expect(r.validacion.tasaSupervivencia).toBe(0.5);
  });

  /**
   * Si no queda nada publicable, `texto` es la cadena vacía. Quien llame tiene
   * que tratarlo como «no hay evidencia suficiente», no como respuesta corta.
   */
  it("sin nada citado devuelve texto vacío, no una respuesta corta", () => {
    const r = procesarRespuesta([{ type: "text", text: "Todo inventado." }], CHUNKS);
    expect(r.texto).toBe("");
    expect(r.referencias).toEqual([]);
  });

  it("una cita a un chunk que no se le dio se reporta como fantasma", () => {
    const r = procesarRespuesta(
      [{ type: "text", text: "x", citations: [{ source: "ley:9999:2099:art:1" }] }],
      CHUNKS,
    );
    expect(r.validacion.citasFantasma).toEqual(["ley:9999:2099:art:1"]);
    expect(r.texto).toBe("");
  });
});

describe("la instrucción del sistema", () => {
  /**
   * Los fallos de este tipo de asistente son por EXCESO: responder de más,
   * suavizar una negativa, convertir «no consta» en «no hay». Por eso la
   * instrucción dedica más espacio a lo que no debe hacer.
   */
  it("nombra las cuatro confusiones que el gold set castiga", () => {
    expect(SISTEMA).toContain("No consta en el corpus");
    expect(SISTEMA).toContain("Un proyecto de ley NO es una ley");
    expect(SISTEMA).toContain("archivo NO significa que el tema esté cerrado");
    expect(SISTEMA).toContain("NO significa que no exista");
  });

  it("prohíbe afirmar vigencia sin fuente y dar asesoría jurídica", () => {
    expect(SISTEMA).toContain("No afirmes que una norma está vigente");
    expect(SISTEMA).toContain("No des asesoría jurídica");
  });
});
