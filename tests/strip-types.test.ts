/**
 * ¿Puede NODE ejecutar cada `.ts` del repo, o solo vitest?
 *
 * Node corre estos ficheros con *type stripping*, que entiende MENOS TypeScript
 * que un transpilador: no admite `enum`, `namespace`, ni propiedades de
 * parámetro (`constructor(readonly x: string)`). Vitest transpila con esbuild,
 * que sí las admite — así que `pnpm verify` puede quedar entero en verde
 * mientras `pnpm qa` y `pnpm gold:run` revientan al arrancar con
 * ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX.
 *
 * No es hipotético: pasó el 2026-08-20 con `RespuestaIlegible`. 429 tests en
 * verde y los dos comandos de usuario caídos. Esa costura —entre lo que se
 * prueba y lo que se ejecuta— es lo que cierra este fichero.
 *
 * `node --check` aplica exactamente el mismo analizador que la ejecución, sin
 * ejecutar nada.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAICES = ["collectors/src", "db", "gold", "mcp/src", "web/src", "tui/src"];
const IGNORAR = new Set(["node_modules", ".next", "dist"]);

function ficheros(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (IGNORAR.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...ficheros(p));
    // `.tsx` NO: lleva JSX, que el analizador de Node no entiende y no tiene
    // por qué — esos ficheros los compila Next y Node nunca los ejecuta
    // directamente. La guarda es para lo que Node SÍ arranca.
    else if (e.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("Node puede analizar cada .ts, no solo vitest", () => {
  const todos = RAICES.flatMap(ficheros);

  it("encuentra ficheros que comprobar", () => {
    expect(todos.length).toBeGreaterThan(30);
  });

  it.each(todos)("%s pasa el analizador de Node", (f) => {
    // `--check` no ejecuta: solo analiza, con el mismo parser que la ejecución.
    expect(() => execFileSync(process.execPath, ["--check", f], { stdio: "pipe" })).not.toThrow();
  });
});
