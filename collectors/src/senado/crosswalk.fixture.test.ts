/**
 * El parser contra el universo REAL de formatos.
 *
 * `fixtures/numero-camara-2024-2025.json` son los 221 valores distintos de
 * `numero_camara` de una legislatura cerrada, capturados de la API del Senado
 * el 2026-08-19. No es una muestra escogida: es todo lo que la fuente publicó
 * ese año.
 *
 * Este test es el que de verdad protege el crosswalk. Los tests unitarios
 * comprueban las siete variantes que yo vi; este comprueba que no haya una
 * octava que se me escapara — y fallará el día que el Senado invente una.
 */

import { describe, expect, it } from "vitest";
import { parseNumero } from "./crosswalk.ts";
import fixture from "./fixtures/numero-camara-2024-2025.json" with { type: "json" };

const VALORES: string[] = fixture.valores;

describe("crosswalk contra los datos reales de 2024-2025", () => {
  it("el fixture trae su procedencia, como todo en este proyecto", () => {
    expect(fixture._procedencia.fuente).toMatch(/leyes\.senado\.gov\.co/);
    expect(fixture._procedencia.captured_at).toBe("2026-08-19");
    expect(VALORES.length).toBeGreaterThan(200);
  });

  /**
   * El criterio de éxito NO es «ninguno ilegible»: un ilegible legítimo es un
   * resultado correcto y va a cuarentena. Lo que se comprueba es que el parser
   * interprete la inmensa mayoría, y que lo que no interprete quede DECLARADO
   * en vez de convertirse en un null indistinguible de un campo vacío.
   */
  it("interpreta al menos el 98 % de los valores reales", () => {
    const ilegibles = VALORES.filter((v) => parseNumero(v).ilegible);
    const tasa = 1 - ilegibles.length / VALORES.length;
    // Si esto falla, el mensaje trae los casos concretos, no solo el número.
    expect(ilegibles.slice(0, 10)).toEqual([]);
    expect(tasa).toBeGreaterThanOrEqual(0.98);
  });

  it("todo valor interpretado produce un canónico comparable", () => {
    for (const v of VALORES) {
      const r = parseNumero(v);
      if (r.ilegible || !r.principal) continue;
      // La forma canónica es lo único que se puede comparar entre cámaras.
      expect(r.principal.canonico).toMatch(/^\d{3}\/\d{2}$/);
      // El original se conserva SIEMPRE: es la evidencia, no un detalle.
      expect(r.principal.original).toBeTruthy();
      expect(r.raw).toBe(v.trim());
    }
  });

  it("ningún año se normaliza a un valor imposible", () => {
    for (const v of VALORES) {
      const r = parseNumero(v);
      if (!r.principal) continue;
      const anio = Number.parseInt(r.principal.anio, 10);
      // El Congreso colombiano no legisla en el año 20 ni en el 99 de este siglo.
      // Este assert es el que habría cazado el bug de `\d{2}|\d{4}`, que
      // convertía 2026 en «20».
      expect(anio).toBeGreaterThanOrEqual(21);
      expect(anio).toBeLessThanOrEqual(40);
    }
  });

  it("las acumulaciones se detectan y son 1:N", () => {
    const conAcum = VALORES.map(parseNumero).filter((r) => r.acumulados.length > 0);
    // Medido: 7 valores con acumulación en 2024-2025.
    expect(conAcum.length).toBeGreaterThanOrEqual(5);
    // El caso extremo real acumula cinco proyectos a uno.
    const maxAcum = Math.max(...conAcum.map((r) => r.acumulados.length));
    expect(maxAcum).toBeGreaterThanOrEqual(5);
  });

  it("la cobertura del crosswalk es minoritaria, y el fixture lo documenta", () => {
    const { filas_totales, filas_con_numero_camara } = fixture._procedencia;
    const cobertura = filas_con_numero_camara / filas_totales;
    // 224/471 = 47,6 %. Si algún día sube, este test lo hará notar — y sería
    // una buena noticia que merece revisar el presupuesto del work item.
    expect(cobertura).toBeLessThan(0.6);
    expect(cobertura).toBeGreaterThan(0.35);
  });
});
