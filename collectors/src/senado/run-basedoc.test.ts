/**
 * El colector basedoc, sin red. El cruce lead→cláusula se prueba en
 * `cerrar-leads.test.ts`; aquí se comprueba el artefacto y el gate.
 */

import { describe, expect, it } from "vitest";
import type { HttpDeps } from "../http.ts";
import { codigoSalidaBasedoc, recolectarBasedoc } from "./run-basedoc.ts";

const CABECERA = '<!DOCTYPE html><HTML xmlns="http://www.w3.org/1999/xhtml" lang="es"><BODY>';
const RELLENO = `<p>${"texto de relleno para superar el minimo del gate. ".repeat(500)}</p>`;

function depsCon(html: string, js = ""): HttpDeps {
  return {
    fetch: async (input) => {
      const u = String(input);
      const cuerpo = u.endsWith(".js") ? js : html;
      return new Response(new TextEncoder().encode(cuerpo), {
        status: 200,
        headers: {
          "Content-Type": u.endsWith(".js")
            ? "application/javascript"
            : "text/html; charset=ISO-8859-1",
        },
      });
    },
    now: () => new Date("2026-08-20T00:00:00Z"),
    sleep: async () => {},
  };
}

describe("recolectarBasedoc", () => {
  it("una captura HTML bloqueada no se parsea, pero se registra", async () => {
    const { basedoc } = await recolectarBasedoc("Ley", "1616", 2013, depsCon("<html></html>"));
    expect(basedoc.gate.outcome).toBe("bloqueado");
    expect(basedoc.parse).toBeNull();
    expect(basedoc.cierre).toBeNull();
    expect(codigoSalidaBasedoc(basedoc)).toBe(1);
    expect(basedoc._procedencia.html.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sin JS compañero declara cajasEnJs 0: no es «cero afectaciones»", async () => {
    const html = `${CABECERA}<div id="update_date">Última actualización: 15 de agosto de 2026</div>${RELLENO}</BODY></HTML>`;
    const { basedoc } = await recolectarBasedoc("Ley", "1616", 2013, depsCon(html, ""));
    expect(basedoc.gate.outcome).toBe("ok");
    expect(basedoc.parse?.cajasEnJs).toBe(0);
    expect(basedoc.parse?.leads).toEqual([]);
    expect(codigoSalidaBasedoc(basedoc)).toBe(0);
  });

  it("el JS se hashea y no se guarda: es prosa de Avance Jurídico", async () => {
    const html = `${CABECERA}<div id="update_date">Última actualización: 15 de agosto de 2026</div>${RELLENO}</BODY></HTML>`;
    const js =
      "function insRow2(){ return '<div>En criterio del editor — Avance Jurídico</div>'; }";
    const { basedoc } = await recolectarBasedoc("Ley", "1616", 2013, depsCon(html, js));
    expect(basedoc._procedencia.js?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(basedoc)).not.toContain("En criterio del editor");
    expect(JSON.stringify(basedoc)).not.toContain(js);
  });
});
