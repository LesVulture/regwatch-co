/**
 * Lo que un MCP server tiene que garantizar, y no es que responda.
 *
 * Exponer la consulta a un agente cambia el modelo de amenaza: **un agente
 * itera sin cansarse**. Lo que un humano haría cien veces, un agente lo hace
 * cien mil, así que cualquier dato que salga por aquí sale, en la práctica, en
 * bloque — aunque cada llamada devuelva una fila.
 *
 * Por eso el contexto de egreso de este canal es `"mcp"` y nunca
 * `"ficha_individual"`. Estos tests fijan esa propiedad.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { puedeSalir } from "../../collectors/src/egreso/politica.ts";

const FUENTE = readFileSync(new URL("./server.ts", import.meta.url), "utf-8");

/**
 * El SQL... perdón, el código sin comentarios.
 *
 * Hace falta porque el propio fichero EXPLICA en prosa por qué no usa
 * `ficha_individual`, y un test que casara contra el texto plano fallaría por
 * el comentario que documenta la regla. Lo que se comprueba es el código.
 */
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("el canal MCP usa el contexto de bloque", () => {
  /**
   * EL TEST QUE IMPIDE LA REGRESIÓN MÁS FÁCIL DE COMETER: cambiar `"mcp"` por
   * `"ficha_individual"` porque «cada llamada devuelve un registro». Es cierto
   * y es irrelevante — el agente hace la llamada cien mil veces.
   */
  it("ninguna herramienta usa `ficha_individual`", () => {
    expect(CODIGO).not.toContain('"ficha_individual"');
  });

  it("las dos herramientas pasan el contexto `mcp`", () => {
    const usos = CODIGO.match(/"mcp"/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * La consecuencia concreta, verificada contra la política y no contra la
   * intención: el correo institucional sale en una ficha web y NO por aquí.
   */
  it("el correo institucional NO sale por MCP, aunque sí salga en una ficha", () => {
    expect(puedeSalir("contacto_servidor_publico", "ficha_individual").sale).toBe(true);
    expect(puedeSalir("contacto_servidor_publico", "mcp").sale).toBe(false);
  });

  it("la prosa editorial tampoco, como en cualquier otro canal", () => {
    expect(puedeSalir("prosa_editorial", "mcp").sale).toBe(false);
  });
});

describe("las herramientas son de solo lectura", () => {
  /**
   * Un agente con capacidad de escribir en el corpus podría contaminar la
   * evidencia, y la evidencia es lo único que este proyecto tiene.
   */
  it("solo se registran las dos herramientas de consulta", () => {
    const registradas = [...CODIGO.matchAll(/registerTool\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(registradas.sort()).toEqual(["buscar_normatividad", "consultar_vigencia"]);
  });

  it("no se expone ninguna herramienta que escriba", () => {
    for (const verbo of ["insert", "update", "delete", "crear", "borrar", "escribir"]) {
      expect(CODIGO.toLowerCase()).not.toContain(`registertool("${verbo}`);
    }
  });
});

describe("toda respuesta arrastra la advertencia", () => {
  /**
   * Va en la RESPUESTA y no en la descripción de la herramienta: la descripción
   * se lee una vez, la respuesta se lee siempre. Un agente que recibe una lista
   * tiende a presentarla como «lo que hay», y estas frases son las que impiden
   * que un vacío se convierta en una afirmación.
   */
  it("dice que la ausencia no es inexistencia y que no es asesoría jurídica", () => {
    expect(FUENTE).toContain("NO que no exista");
    expect(FUENTE).toContain("no es asesoría jurídica");
    expect(FUENTE).toContain("cítalas");
  });

  it("las dos herramientas la añaden", () => {
    const usos = CODIGO.match(/ADVERTENCIA_SIEMPRE/g) ?? [];
    // Una definición + dos usos.
    expect(usos.length).toBeGreaterThanOrEqual(3);
  });
});

describe("buscar_normatividad embebe igual que la web", () => {
  /**
   * Callar la degradación aquí y declararla en la web haría que un agente
   * creyera que busca en semántico cuando no. El aviso tiene que ser el mismo.
   */
  it("pide el vector y declara si no hay semántica", () => {
    expect(CODIGO).toContain("embeberConsulta");
    expect(FUENTE).toContain("Solo búsqueda léxica en esta consulta");
  });
});
