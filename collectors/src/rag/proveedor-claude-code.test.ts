/**
 * El proveedor, probado sin invocar `claude`.
 *
 * Lo que se comprueba no es que el CLI funcione —eso lo dice la primera
 * ejecución real—, sino las tres cosas que, de romperse, romperían el contrato
 * de evidencia sin que ningún test rojo lo dijera: que el subproceso no pueda
 * traer texto de fuera del prompt, que un fallo de sesión no se lea como «no
 * consta», y que no se llame al modelo sin evidencia.
 */

import { describe, expect, it } from "vitest";
import type { Chunk } from "./chunking.ts";
import {
  argumentos,
  construirPrompt,
  HERRAMIENTAS_NEGADAS,
  leerSobre,
  MODELO,
  preguntar,
} from "./proveedor-claude-code.ts";

const CHUNKS: Chunk[] = [
  {
    id: "ley:1616:2013:art:1",
    fuente: "norma",
    referencia: "Ley 1616 de 2013, artículo 1",
    texto: "ARTÍCULO 1o. OBJETO. Garantizar el ejercicio pleno del Derecho a la Salud Mental.",
    caracteres: 80,
    urlFuente: "http://x/y.html",
    capturedAt: "2026-08-20T00:00:00.000Z",
  },
];

const sobre = (extra: Record<string, unknown>) => JSON.stringify(extra);

describe("argumentos — las barreras del subproceso", () => {
  /**
   * LA BARRERA QUE IMPORTA. Con herramientas, el modelo podría abrir un fichero
   * o buscar en la web y citar algo que NO está en el corpus — y la validación
   * de R2 lo daría por bueno, porque el `chunk_id` existiría igual.
   */
  it("niega toda herramienta que pueda traer texto de fuera del prompt", () => {
    const a = argumentos();
    for (const h of ["Bash", "Read", "WebSearch", "WebFetch", "Glob", "Grep"]) {
      expect(HERRAMIENTAS_NEGADAS).toContain(h);
      expect(a).toContain(h);
    }
    expect(a).toContain("--disallowed-tools");
  });

  it("no hereda los servidores MCP del usuario", () => {
    expect(argumentos()).toContain("--strict-mcp-config");
  });

  it("un solo turno y salida JSON", () => {
    const a = argumentos();
    expect(a[a.indexOf("--max-turns") + 1]).toBe("1");
    expect(a[a.indexOf("--output-format") + 1]).toBe("json");
  });

  /**
   * `--system-prompt` REEMPLAZA; `--append-system-prompt` añadiría las
   * instrucciones de un asistente de programación, que compiten con R5/R7.
   */
  it("reemplaza el system prompt en vez de añadirse a él", () => {
    expect(argumentos()).toContain("--system-prompt");
    expect(argumentos()).not.toContain("--append-system-prompt");
  });

  it("usa el modelo declarado", () => {
    const a = argumentos();
    expect(a[a.indexOf("--model") + 1]).toBe(MODELO);
    expect(argumentos("opus")[argumentos("opus").indexOf("--model") + 1]).toBe("opus");
  });
});

describe("construirPrompt", () => {
  it("manda la evidencia como JSON con su chunk_id y su texto", () => {
    const p = construirPrompt("¿qué dice?", CHUNKS);
    expect(p).toContain('"chunk_id"');
    expect(p).toContain("ley:1616:2013:art:1");
    expect(p).toContain("Derecho a la Salud Mental");
    expect(p).toContain("¿qué dice?");
  });

  /**
   * EL FALSO NEGATIVO QUE ESTO EVITA. Sin los huecos en el prompt, la respuesta
   * salía afirmando «no consta información sobre proyectos de ley de
   * inteligencia artificial» mientras el sistema imprimía cuatro justo debajo.
   */
  it("mete los huecos y prohíbe expresamente afirmar que no existen", () => {
    const p = construirPrompt("¿qué dice?", CHUNKS, ["125/26 (proyecto_ley) — http://x"]);
    expect(p).toContain("125/26");
    expect(p).toContain("no afirmes que no existen");
    expect(p).toContain("no los cites");
  });

  it("sin huecos, no aparece la sección", () => {
    expect(construirPrompt("¿qué dice?", CHUNKS)).not.toContain("NO está capturado");
  });
});

describe("leerSobre — el fallo que se disfraza de respuesta vacía", () => {
  it("devuelve el texto del modelo", () => {
    expect(leerSobre(sobre({ is_error: false, result: '{"frases":[]}' }))).toBe('{"frases":[]}');
  });

  /**
   * El CLI sale con código 0 y `is_error: true` cuando el turno acabó mal. Si
   * eso se leyera como respuesta vacía, un fallo de sesión aparecería ante el
   * usuario como «no consta en el corpus»: la peor confusión posible aquí.
   */
  it("un `is_error` con código de salida 0 lanza, no devuelve vacío", () => {
    expect(() =>
      leerSobre(sobre({ is_error: true, subtype: "error_max_turns", result: "" })),
    ).toThrow(/error_max_turns/);
  });

  it("lo que no es JSON no se interpreta", () => {
    expect(() => leerSobre("command not found")).toThrow(/no devolvió JSON/);
  });

  it("un sobre sin `result` de texto lanza", () => {
    expect(() => leerSobre(sobre({ is_error: false }))).toThrow(/`result`/);
  });
});

describe("preguntar", () => {
  it("no llama al modelo sin evidencia que citar", async () => {
    let llamadas = 0;
    await expect(
      preguntar("¿y esto?", [], {
        deps: {
          ejecutar: async () => {
            llamadas++;
            return { code: 0, stdout: "", stderr: "" };
          },
        },
      }),
    ).rejects.toThrow(/no hay evidencia/);
    expect(llamadas).toBe(0);
  });

  it("propaga el error del subproceso con su stderr", async () => {
    await expect(
      preguntar("x", CHUNKS, {
        deps: { ejecutar: async () => ({ code: 1, stdout: "", stderr: "not logged in" }) },
      }),
    ).rejects.toThrow(/código 1.*not logged in/s);
  });

  it("devuelve el texto CRUDO: no valida nada aquí", async () => {
    const crudo = '{"frases":[{"texto":"x","citas":[]}]}';
    const r = await preguntar("x", CHUNKS, {
      deps: {
        ejecutar: async () => ({
          code: 0,
          stdout: sobre({ is_error: false, result: crudo }),
          stderr: "",
        }),
      },
    });
    expect(r).toBe(crudo);
  });
});
