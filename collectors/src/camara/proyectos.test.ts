/**
 * Tests del colector de Cámara.
 *
 * **Ninguno toca la red, y no es por comodidad de test:** las Políticas de uso
 * del portal prohíben el almacenamiento sin autorización previa y escrita, y esa
 * autorización no existe todavía. Los fixtures son sintéticos con la forma
 * medida en `research/refute2-congreso.json`.
 */

import { describe, expect, it } from "vitest";
import {
  AUTORIZACION,
  AutorizacionPendienteError,
  parseCamara,
  peticionPagina,
  recolectar,
  verificarAutorizacion,
} from "./proyectos.ts";

describe("la guarda de autorización", () => {
  /**
   * EL TEST QUE MÁS IMPORTA DE ESTE FICHERO. Si alguien pone `concedida: true`
   * sin que exista respuesta favorable, este test no lo impide — pero el
   * cambio queda en el historial de git con fecha y autor, que es exactamente
   * por lo que la bandera vive en código y no en un `.env`.
   */
  it("hoy NO hay autorización, y el colector se niega a correr", () => {
    expect(AUTORIZACION.concedida).toBe(false);
    expect(AUTORIZACION.radicado).toBeNull();
    expect(() => verificarAutorizacion()).toThrow(AutorizacionPendienteError);
  });

  it("el error explica qué falta y dónde está el escrito", () => {
    expect(() => verificarAutorizacion()).toThrow(/derecho de petición/);
    expect(() => verificarAutorizacion()).toThrow(/legal\/peticiones/);
  });

  it("recolectar() lanza ANTES de tocar la red", async () => {
    await expect(recolectar()).rejects.toThrow(AutorizacionPendienteError);
  });
});

describe("peticionPagina — sin scraping de nonce", () => {
  /**
   * Está MEDIDO que la fuente no valida `_ajax_nonce`: responde igual con un
   * nonce falso y omitiéndolo. Los 6.446 registros del corpus se bajaron con
   * `'x'`. Montar un scraper de nonce con su ruta de fallo por caché resolvería
   * un problema que hoy no existe, y por eso sale del presupuesto.
   */
  it("manda un nonce fijo y evidente, no uno scrapeado", () => {
    const p = peticionPagina(1);
    expect(p.form._ajax_nonce).toBe("x");
    expect(p.form.action).toBe("get_proyectos_ley_page");
    expect(p.url).toContain("admin-ajax.php");
  });

  it("por defecto pide todas las legislaturas", () => {
    expect(peticionPagina(2).form.legislatura).toBe("All");
    expect(peticionPagina(2, "3").form.legislatura).toBe("3");
  });
});

describe("parseCamara", () => {
  const envolver = (items: unknown[], total = items.length, paginas = 1) =>
    JSON.stringify({ success: true, data: { items, total, total_pages: paginas } });

  const fila = {
    numero_camara: "407/24",
    numero_senado: "008/24",
    titulo: "Proyecto de prueba",
    estado: "En trámite",
    comision: "PRIMERA",
  };

  it("lee items, total y total_pages", () => {
    const r = parseCamara(envolver([fila], 6446, 65), 1);
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(6446);
    expect(r.totalPaginas).toBe(65);
    expect(r.anomalias).toEqual([]);
  });

  it("una página vacía DENTRO del rango declarado es una señal", () => {
    const r = parseCamara(envolver([], 6446, 65), 30);
    expect(r.anomalias.some((a) => a.clase === "pagina-vacia")).toBe(true);
  });

  it("una fila sin ningún número se declara", () => {
    const r = parseCamara(envolver([{ titulo: "sin números" }]), 1);
    expect(r.anomalias.some((a) => a.clase === "sin-numero")).toBe(true);
  });

  it("success:false se reporta", () => {
    const j = JSON.stringify({ success: false, data: { items: [], total: 0, total_pages: 0 } });
    expect(parseCamara(j, 1).anomalias.some((a) => a.clase === "envelope-inesperado")).toBe(true);
  });

  it("lanza si el envelope no trae data.items", () => {
    expect(() => parseCamara(JSON.stringify({ items: [] }), 1)).toThrow(/data\.items/);
    expect(() => parseCamara("<html>", 1)).toThrow(/no devolvió JSON/);
  });
});
