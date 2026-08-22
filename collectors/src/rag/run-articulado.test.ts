/**
 * El colector de articulado, sin tocar la red.
 *
 * `HttpDeps` se inyecta, así que la corrida entera —petición, gate 0, saneado,
 * chunking y detección de contaminación— se prueba con un `fetch` falso.
 */

import { describe, expect, it } from "vitest";
import type { HttpDeps } from "../http.ts";
import {
  codigoSalidaArticulado,
  MARCADORES_EDITORIALES,
  recolectarArticulado,
  slugBasedoc,
  urlSiguientePagina,
} from "./run-articulado.ts";

/**
 * El gate 0 exige DOS cosas para `senado-basedoc`, y las dos las descubrió este
 * test fallando: >= 20.000 bytes, y un `<html>` o `<!DOCTYPE>` en los primeros
 * 2 KB. Un fixture sin cabecera se bloquea — que es el gate haciendo su trabajo
 * contra un fixture poco realista, no un fallo del colector.
 */
const CABECERA = '<!DOCTYPE html><HTML xmlns="http://www.w3.org/1999/xhtml" lang="es"><BODY>';
const RELLENO = `<p>${"texto de relleno para superar el minimo del gate. ".repeat(500)}</p>`;

const ARTICULADO = [
  '<p><a class="bookmarkaj" name="1">ART&Iacute;CULO 1o. OBJETO.</A>',
  "El objeto de la presente ley es garantizar el Derecho a la Salud Mental.</p>",
  '<p><a class="bookmarkaj" name="2">ART&Iacute;CULO 2o. VIGENCIA.</A>',
  "La presente ley rige a partir de su publicaci&oacute;n.</p>",
].join("\n");

const PIE_EDITORIAL = [
  '<div><a class="caja_vja_encabezado" href="javascript:insRow2()">Notas de Vigencia</a></div>',
  '<table id="Table2" class="caja_vja_v"></table>',
  "<!--Fin documento-->",
  '<div id="logo_aj"><div>Disposiciones analizadas por Avance Jur&iacute;dico Casa',
  "Editorial S.A.S. ISSN [1657-6241] protegidas por las normas sobre derecho de autor.</div></div>",
].join("\n");

function depsCon(html: string): HttpDeps {
  return {
    fetch: async () =>
      new Response(new TextEncoder().encode(html), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=ISO-8859-1" },
      }),
    now: () => new Date("2026-08-20T00:00:00Z"),
    sleep: async () => {},
  };
}

describe("slugBasedoc", () => {
  it("nombra el fichero como lo nombra la fuente", () => {
    expect(slugBasedoc("Ley", "1616", 2013)).toBe("ley_1616_2013");
    expect(slugBasedoc("Decreto Ley", "19", 2012)).toBe("decreto_ley_19_2012");
  });
});

describe("recolectarArticulado", () => {
  it("saca los artículos y NO reporta contaminación cuando el saneado muerde", async () => {
    const art = await recolectarArticulado(
      "Ley",
      "1616",
      2013,
      depsCon(`${CABECERA}\n${ARTICULADO}\n${RELLENO}\n${PIE_EDITORIAL}`),
    );

    expect(art.gate.outcome).toBe("ok");
    expect(art.chunks).toHaveLength(2);
    expect(art.contaminados).toEqual([]);
    expect(art.chunks[0]?.id).toBe("ley:1616:2013:art:1");
  });

  /**
   * LA COMPROBACIÓN QUE JUSTIFICA EL CAMPO. `contaminados` no limpia nada: dice
   * si el saneador dejó de morder. Si la fuente cambia de marcado, esto se
   * entera; sin ello se publicaría texto que no es de dominio público.
   */
  it("reporta los chunks contaminados si el aparato editorial se cuela", async () => {
    // Marcado que `soloArticulado` no reconoce: el pie sin `<div id="logo_aj">`
    // ni `<!--Fin documento-->`, colgando directamente del último artículo.
    const html =
      `${CABECERA}\n${ARTICULADO}\n${RELLENO}\n` +
      "<p>Disposiciones analizadas por Avance Jur&iacute;dico Casa Editorial S.A.S. " +
      "ISSN [1657-6241] protegidas por las normas sobre derecho de autor.</p>";

    const art = await recolectarArticulado("Ley", "1616", 2013, depsCon(html));
    expect(art.contaminados.length).toBeGreaterThan(0);
  });

  it("una captura bloqueada no se parsea, pero se registra", async () => {
    // Cuerpo por debajo del mínimo de la fuente: el gate 0 lo bloquea.
    const art = await recolectarArticulado("Ley", "1616", 2013, depsCon("<html></html>"));
    expect(art.gate.outcome).toBe("bloqueado");
    expect(art.chunks).toEqual([]);
    expect(art.estadisticas).toBeNull();
    // La procedencia se conserva: es el punto de replay.
    expect(art._procedencia.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(codigoSalidaArticulado(art)).toBe(1);
  });

  it("sigue la página antsig y parte el articulado de las dos", async () => {
    const p1 = `${CABECERA}\n${ARTICULADO}\n${RELLENO}\n<p style="text-align:center;"><a class=antsig href="ley_1616_2013_pr001.html">Siguiente</a></p>\n${PIE_EDITORIAL}`;
    const p2 = `${CABECERA}\n<p><a class="bookmarkaj" name="3">ART&Iacute;CULO 3o. DISPOSICIONES.</A> Texto de la continuaci&oacute;n.</p>\n${RELLENO}\n${PIE_EDITORIAL}`;
    const deps: HttpDeps = {
      fetch: async (input) => {
        const u = String(input);
        const html = u.includes("_pr001") ? p2 : p1;
        return new Response(new TextEncoder().encode(html), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=ISO-8859-1" },
        });
      },
      now: () => new Date("2026-08-20T00:00:00Z"),
      sleep: async () => {},
    };
    const art = await recolectarArticulado("Ley", "1616", 2013, deps);
    expect(art.paginas).toHaveLength(2);
    expect(art.paginacionIncompleta).toBe(false);
    expect(art.anomalias).toEqual([]);
    expect(art.chunks.map((c) => c.id)).toContain("ley:1616:2013:art:3");
    expect(codigoSalidaArticulado(art)).toBe(0);
  });

  /**
   * Medido en vivo el 2026-08-21: Ley 1616, antsig de la página 1 → `_pr001`,
   * y `_pr001` vuelve a la primera. Sin corte de ciclo el colector pedía las
   * mismas 2 URLs 15 veces (`MAX_PAGINAS`) y salía 1 por `paginacionIncompleta`.
   * Evidencia: `docs/verificacion-viva-2026-08-21.md`.
   */
  it("corta el ciclo antsig página1 ↔ _pr001 y lo declara, sin pedir 15 páginas", async () => {
    const p1 = `${CABECERA}\n${ARTICULADO}\n${RELLENO}\n<p style="text-align:center;"><a class=antsig href="ley_1616_2013_pr001.html">Siguiente</a></p>\n${PIE_EDITORIAL}`;
    const p2 = `${CABECERA}\n<p><a class="bookmarkaj" name="3">ART&Iacute;CULO 3o. DISPOSICIONES.</A> Texto de la continuaci&oacute;n.</p>\n${RELLENO}\n<p style="text-align:center;"><a class=antsig href="ley_1616_2013.html">Siguiente</a></p>\n${PIE_EDITORIAL}`;
    let peticiones = 0;
    const deps: HttpDeps = {
      fetch: async (input) => {
        peticiones += 1;
        const u = String(input);
        const html = u.includes("_pr001") ? p2 : p1;
        return new Response(new TextEncoder().encode(html), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=ISO-8859-1" },
        });
      },
      now: () => new Date("2026-08-21T00:00:00Z"),
      sleep: async () => {},
    };
    const art = await recolectarArticulado("Ley", "1616", 2013, deps);
    expect(peticiones).toBe(2);
    expect(art.paginas).toHaveLength(2);
    expect(art.paginas.map((p) => p.url)).toEqual([
      "http://www.secretariasenado.gov.co/senado/basedoc/ley_1616_2013.html",
      "http://www.secretariasenado.gov.co/senado/basedoc/ley_1616_2013_pr001.html",
    ]);
    expect(art.paginacionIncompleta).toBe(false);
    expect(art.anomalias.some((a) => a.clase === "ciclo-paginacion")).toBe(true);
    expect(art.anomalias[0]?.detalle).toMatch(/ley_1616_2013\.html/);
    expect(codigoSalidaArticulado(art)).toBe(1);
  });
});

describe("urlSiguientePagina y codigoSalidaArticulado", () => {
  it("resuelve el href relativo de antsig y rechaza HTTPS", () => {
    const base = "http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html";
    expect(
      urlSiguientePagina('<a class=antsig href="ley_1581_2012_pr001.html">Siguiente</a>', base),
    ).toBe("http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012_pr001.html");
    expect(
      urlSiguientePagina(
        '<a class=antsig href="https://www.secretariasenado.gov.co/x.html">Siguiente</a>',
        base,
      ),
    ).toBeNull();
    expect(urlSiguientePagina("<p>sin continuación</p>", base)).toBeNull();
  });
});

describe("MARCADORES_EDITORIALES", () => {
  /**
   * La lista es la red de seguridad, así que tiene que nombrar lo que Avance
   * Jurídico pone de verdad en sus documentos. Medido en la Ley 1616 de 2013.
   */
  it("cubre los rótulos y el aviso de copyright que emite la fuente", () => {
    for (const m of ["Notas de Vigencia", "Legislación Anterior", "Avance Jurídico", "ISSN"]) {
      expect(MARCADORES_EDITORIALES).toContain(m);
    }
  });
});
