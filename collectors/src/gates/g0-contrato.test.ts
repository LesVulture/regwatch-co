/**
 * Los casos de prueba NO son inventados: cada uno reproduce un fallo medido
 * en campo y documentado en `research/`. Un gold set escrito a mano deja de
 * medir a los seis meses; uno anclado a incidentes reales, no.
 */

import { describe, expect, it } from "vitest";
import type { RawCapture } from "../evidence.ts";
import { g0Contrato } from "./g0-contrato.ts";

function capture(over: Partial<RawCapture> = {}): RawCapture {
  return {
    url: "https://corteconstitucional.gov.co/api/x",
    capturedAt: "2026-08-19T12:00:00.000Z",
    contentHash: "x".repeat(64),
    // MEDIDO 2026-08-20: la relatoría sirve su JSON con `Content-Type: text/html`.
    // Este default decía `application/json` y era la especificación EQUIVOCADA:
    // con ella el gate bloqueaba el 100 % de las respuestas válidas de la fuente.
    contentType: "text/html; charset=UTF-8",
    httpStatus: 200,
    byteLength: 10_000,
    sourceKey: "corte-relatoria",
    ...over,
  };
}

const enc = (s: string) => new TextEncoder().encode(s);

describe("g0 — la aduana", () => {
  it("deja pasar un JSON legítimo", () => {
    // Cuerpo realista: una respuesta sana de la relatoría trae cientos de
    // providencias. Un test con 500 bytes no probaría lo que dice probar,
    // porque lo bloquearía antes el umbral de tamaño.
    const body = enc(
      JSON.stringify({
        hits: { hits: new Array(60).fill({ id: "C-748-11", texto: "x".repeat(100) }) },
      }),
    );
    expect(body.length).toBeGreaterThan(5_000);
    const v = g0Contrato(capture({ byteLength: body.length }), body);
    expect(v.outcome).toBe("ok");
  });

  /**
   * INCIDENTE REAL — refute-jurisprudencia.json.
   * `maxprov=10001` devuelve HTTP 200 con 2.882 bytes de fragmento HTML.
   * Este es el caso que un ingestor ingenuo registra como "cero resultados".
   */
  it("atrapa el éxito falso de la Corte: HTTP 200 con HTML en vez de JSON", () => {
    // Se pasa del umbral de tamaño a propósito, para probar que el marcador
    // atrapa el caso POR SÍ SOLO. El incidente real traía 2.882 bytes, así que
    // en producción lo habrían atrapado las dos reglas — pero un test que
    // dependa de eso no estaría midiendo lo que dice medir.
    const body = enc("<html><body>Se ha producido un error</body></html>".padEnd(9000, " "));
    const v = g0Contrato(capture({ byteLength: body.length }), body);
    expect(v.outcome).toBe("bloqueado");
    expect(v.reglaViolada).toBe("marcador-de-error");
  });

  it("el incidente REAL de la Corte (2.882 bytes de HTML) queda atrapado igual", () => {
    // Defensa en profundidad: aquí muerde primero el umbral de tamaño. Lo que
    // importa no es qué regla lo pare, sino que no pase.
    const body = enc("<html>error</html>".padEnd(2_882, " "));
    const v = g0Contrato(capture({ byteLength: body.length }), body);
    expect(v.outcome).toBe("bloqueado");
  });

  it("atrapa un JSON truncado aunque el content-type sea correcto", () => {
    const body = enc('{"hits": {"hits": [{"id"'.padEnd(6000, " "));
    const v = g0Contrato(capture({ byteLength: body.length }), body);
    expect(v.outcome).toBe("bloqueado");
    expect(v.reglaViolada).toBe("cuerpo-no-parsea");
  });

  it("NUNCA usa el código HTTP como señal de éxito: un 200 con cascarón se bloquea", () => {
    const body = enc("{}");
    const v = g0Contrato(capture({ httpStatus: 200, byteLength: 2 }), body);
    expect(v.outcome).toBe("bloqueado");
    expect(v.reglaViolada).toBe("tamano-bajo-minimo");
  });

  it("un 500 con cuerpo válido NO se bloquea por el status — el status solo se registra", () => {
    const body = enc(JSON.stringify({ hits: { hits: [] } }).padEnd(6000, " "));
    const v = g0Contrato(capture({ httpStatus: 500, byteLength: body.length }), body);
    expect(v.outcome).toBe("ok");
  });

  it("detecta un content-type que no es el declarado", () => {
    const body = enc(JSON.stringify({ ok: true }).padEnd(6000, " "));
    const v = g0Contrato(capture({ contentType: "text/plain", byteLength: body.length }), body);
    expect(v.outcome).toBe("bloqueado");
    expect(v.reglaViolada).toBe("content-type");
  });

  /**
   * EL HALLAZGO QUE CORRIGIÓ ESTE FICHERO, medido el 2026-08-20 contra la
   * fuente viva: la relatoría devuelve su JSON con `Content-Type: text/html`.
   *
   * `sources.ts` declaraba `application/json`, así que el gate bloqueaba TODAS
   * las respuestas buenas — y un gate mal especificado no se nota: parece que
   * la fuente está caída. La captura real que lo destapó pesaba 2.276.955 bytes
   * y traía 1.141 providencias dentro.
   */
  it("la relatoría sirve JSON con content-type de HTML, y aun así pasa", () => {
    const body = enc(
      JSON.stringify({
        data: {
          hits: {
            total: { value: 60 },
            hits: new Array(60).fill({ _source: { prov_id: 1, texto: "x".repeat(100) } }),
          },
        },
      }),
    );
    const v = g0Contrato(
      capture({ contentType: "text/html; charset=UTF-8", byteLength: body.length }),
      body,
    );
    expect(v.outcome).toBe("ok");
  });

  /**
   * Y como el content-type ya no discrimina, la barrera pasa a ser el marcador.
   * El fragmento de error empieza por `<div class="row alert alert-danger">`,
   * que NO casaba con `<html` ni `<!DOCTYPE`: hasta la corrección solo lo
   * paraba el suelo de tamaño, y eso deja de valer si el error crece.
   */
  it("el fragmento de error de la Corte se atrapa aunque supere el suelo de tamaño", () => {
    const body = enc(
      `        <div class="row alert alert-danger" role="alert" id="div_alert_danger">` +
        `Error</div><!-- ${"x".repeat(9000)} -->`,
    );
    expect(body.length).toBeGreaterThan(5_000);
    const v = g0Contrato(capture({ byteLength: body.length }), body);
    expect(v.outcome).toBe("bloqueado");
    expect(v.reglaViolada).toBe("marcador-de-error");
  });

  it("acepta content-type con charset (se compara por prefijo)", () => {
    // El prefijo declarado para esta fuente es `text/html`; lo que se comprueba
    // aquí es que el `; charset=…` que añaden los servidores no rompa la
    // comparación.
    const body = enc(JSON.stringify({ ok: true }).padEnd(6000, " "));
    const v = g0Contrato(
      capture({ contentType: "text/html; charset=iso-8859-1", byteLength: body.length }),
      body,
    );
    expect(v.outcome).toBe("ok");
  });

  /**
   * MEDIDO — normativa.json: la Secretaría del Senado solo responde por HTTP;
   * el puerto 443 hace timeout. Una captura suya por HTTPS es un fallo de
   * contrato, no algo que reintentar.
   */
  it("bloquea una captura de basedoc por HTTPS, que no puede haber funcionado", () => {
    const body = enc("<html>".padEnd(30_000, "x"));
    const v = g0Contrato(
      capture({
        sourceKey: "senado-basedoc",
        url: "https://www.secretariasenado.gov.co/basedoc/ley_0100_1993.html",
        contentType: "text/html; charset=ISO-8859-1",
        byteLength: body.length,
      }),
      body,
    );
    expect(v.outcome).toBe("bloqueado");
    expect(v.reglaViolada).toBe("esquema-forzado");
  });

  it("un PDF que en realidad es una página de error se bloquea", () => {
    const body = enc("<html>404 no encontrado</html>".padEnd(60_000, " "));
    const v = g0Contrato(
      capture({
        sourceKey: "dnp-conpes",
        contentType: "application/pdf",
        byteLength: body.length,
      }),
      body,
    );
    expect(v.outcome).toBe("bloqueado");
    expect(v.reglaViolada).toBe("cuerpo-no-parsea");
  });

  it("rechaza una fuente no declarada en vez de dejarla pasar", () => {
    const body = enc("{}".padEnd(10_000, " "));
    const v = g0Contrato(capture({ sourceKey: "inventada" }), body);
    expect(v.outcome).toBe("bloqueado");
    expect(v.reglaViolada).toBe("fuente-no-declarada");
  });

  /**
   * DECISIÓN DE DISEÑO — refute2-prensa.json.
   * La Silla Vacía excluye ClaudeBot en su robots.txt. Que esté excluida no es
   * un olvido: el error debe decir por qué, para que nadie la "arregle".
   */
  it("una fuente excluida a propósito explica el motivo en el error", () => {
    const body = enc("{}".padEnd(10_000, " "));
    const v = g0Contrato(capture({ sourceKey: "lasillavacia" }), body);
    expect(v.outcome).toBe("bloqueado");
    expect(v.observado).toMatch(/ClaudeBot/);
  });
});
