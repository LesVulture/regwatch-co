/**
 * Corre g2-pulso contra artefactos ya recolectados. No pide red.
 *
 *   node collectors/src/gates/run-g2.ts artefactos/senado-pdly.json …
 */

import { readFileSync } from "node:fs";
import { g2Pulso, type PulsoVeredicto, pulsoFallaCorrida } from "./g2-pulso.ts";

function maxIso(valores: readonly (string | null | undefined)[]): string | null {
  const ok = valores.filter(
    (v): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v)),
  );
  if (ok.length === 0) return null;
  return ok.sort().at(-1) ?? null;
}

export function pulsoDesdeArtefacto(art: Record<string, unknown>, ahora: string): PulsoVeredicto {
  const corridas = art.corridas as { capturedAt?: string; captured_at?: string }[] | undefined;
  const capturadoEn =
    maxIso((corridas ?? []).map((c) => c.capturedAt ?? c.captured_at)) ??
    (typeof (art._procedencia as { generado?: string } | undefined)?.generado === "string"
      ? (art._procedencia as { generado: string }).generado
      : ahora);

  if (Array.isArray(art.proyectos) && Array.isArray(art.corridas)) {
    // Senado PDLY: los 9 campos medidos no traen fecha del hecho.
    return g2Pulso({
      sourceKey: "senado-pdly",
      fechaHechoMasReciente: null,
      capturadoEn,
      ahora,
    });
  }

  if (Array.isArray(art.providencias) && Array.isArray(art.corridas)) {
    const fechas = (art.providencias as { fechaPublicacion?: string | null }[]).map(
      (p) => p.fechaPublicacion,
    );
    return g2Pulso({
      sourceKey: "corte-relatoria",
      fechaHechoMasReciente: maxIso(fechas),
      capturadoEn,
      ahora,
    });
  }

  if (art.parse && typeof art.parse === "object") {
    const sello =
      (art.parse as { ultimaActualizacion?: string | null }).ultimaActualizacion ?? null;
    return g2Pulso({
      sourceKey: "senado-basedoc",
      fechaHechoMasReciente: sello,
      capturadoEn,
      ahora,
    });
  }

  if (art.norma && art._procedencia) {
    return g2Pulso({
      sourceKey: "senado-basedoc",
      fechaHechoMasReciente: null,
      capturadoEn,
      ahora,
    });
  }

  throw new Error("artefacto de forma no reconocida para g2-pulso");
}

async function main(): Promise<void> {
  const rutas = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (rutas.length === 0) {
    console.error("uso: node collectors/src/gates/run-g2.ts <artefacto.json>…");
    process.exitCode = 1;
    return;
  }
  const ahora = new Date().toISOString();
  let fallos = 0;
  for (const ruta of rutas) {
    const art = JSON.parse(readFileSync(ruta, "utf-8")) as Record<string, unknown>;
    const v = pulsoDesdeArtefacto(art, ahora);
    const marca = pulsoFallaCorrida(v) ? "FAIL" : v.outcome === "ok" ? "ok" : v.outcome;
    console.log(
      `${marca.padEnd(22)} ${v.sourceKey}  cadencia=${v.cadenciaHoras ?? "—"}h  ` +
        `hecho=${v.horasDesdeHecho?.toFixed(0) ?? "—"}h  captura=${v.horasDesdeCaptura?.toFixed(0) ?? "—"}h  ${ruta}`,
    );
    if (v.reglaViolada) console.log(`  · ${v.reglaViolada}: ${v.observado}`);
    if (pulsoFallaCorrida(v)) fallos++;
  }
  if (fallos > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
