/**
 * Backfill de la relatoría de la Corte Constitucional.
 *
 * fetch → gate 0 → parse → artefacto validado, un año por petición.
 *
 * El backfill del plan es 2015-2026, ~12 peticiones. Cabe porque el índice
 * devuelve el año entero de una vez: no hay paginación que recorrer, hay un
 * techo de `maxprov` que respetar — y pasarse NO da error, da 2.882 bytes de
 * fragmento HTML con `HTTP 200`.
 *
 * Uso:
 *   pnpm collect:corte              # 2015-2026
 *   pnpm collect:corte 2020 2026    # rango explícito
 */

import { mkdir, writeFile } from "node:fs/promises";
import { g0Contrato } from "../gates/g0-contrato.ts";
import { depsPorDefecto, type HttpDeps, pedir } from "../http.ts";
import {
  type Anomalia,
  parseRelatoria,
  partirVentana,
  peticionVentana,
  type Ventana,
} from "./relatoria.ts";

export interface CorridaAnio {
  readonly anio: number;
  readonly ventana: Ventana;
  readonly gate: ReturnType<typeof g0Contrato>;
  readonly httpStatus: number;
  readonly bytes: number;
  readonly contentHash: string;
  readonly capturedAt: string;
  readonly providencias: number;
  readonly totalDeclarado: number | null;
  readonly anomalias: readonly Anomalia[];
}

/**
 * Recoge una ventana, PARTIÉNDOLA si la fuente la trunca.
 *
 * `maxprov` corta en silencio: 2023 tiene 3.705 providencias y una consulta
 * anual devuelve 2.000 con HTTP 200. La señal es el contraste contra
 * `hits.total.value`; la respuesta es partir por la mitad y reintentar cada
 * mitad. Recursivo porque una mitad puede seguir pasándose.
 *
 * `profundidad` acota la recursión: sin tope, una fuente que devolviera un
 * total absurdo haría bajar hasta ventanas de un día. Al agotarse, la corrida
 * se registra CON su anomalía en vez de fingir que está completa.
 */
async function recogerVentana(
  anio: number,
  v: Ventana,
  deps: HttpDeps,
  corridas: CorridaAnio[],
  providencias: unknown[],
  profundidad = 0,
): Promise<void> {
  const { capture, body } = await pedir(peticionVentana(v), deps);
  const gate = g0Contrato(capture, body);

  const base = {
    anio,
    ventana: v,
    gate,
    httpStatus: capture.httpStatus,
    bytes: capture.byteLength,
    contentHash: capture.contentHash,
    capturedAt: capture.capturedAt,
  };

  // Una captura bloqueada se registra: es evidencia de que la fuente se rompió.
  if (gate.outcome === "bloqueado") {
    corridas.push({ ...base, providencias: 0, totalDeclarado: null, anomalias: [] });
    return;
  }

  const r = parseRelatoria(new TextDecoder("utf-8").decode(body));
  const truncada = r.anomalias.some((a) => a.clase === "total-no-cuadra");

  if (truncada && profundidad < 6 && v.fini !== v.ffin) {
    const [a, b] = partirVentana(v);
    console.log(
      `       ↳ ${v.fini}..${v.ffin} truncada (${r.providencias.length} de ${r.totalDeclarado}) — se parte`,
    );
    await deps.sleep(2_000);
    await recogerVentana(anio, a, deps, corridas, providencias, profundidad + 1);
    await deps.sleep(2_000);
    await recogerVentana(anio, b, deps, corridas, providencias, profundidad + 1);
    return;
  }

  corridas.push({
    ...base,
    providencias: r.providencias.length,
    totalDeclarado: r.totalDeclarado,
    anomalias: r.anomalias,
  });
  for (const p of r.providencias) providencias.push({ anio, ...p });
}

export async function recolectar(
  anios: readonly number[],
  deps: HttpDeps = depsPorDefecto,
): Promise<{ corridas: CorridaAnio[]; providencias: unknown[] }> {
  const corridas: CorridaAnio[] = [];
  const providencias: unknown[] = [];

  for (const [i, anio] of anios.entries()) {
    if (i > 0) await deps.sleep(2_000); // cortesía
    await recogerVentana(
      anio,
      { fini: `${anio}-01-01`, ffin: `${anio}-12-31` },
      deps,
      corridas,
      providencias,
    );
  }

  return { corridas, providencias };
}

async function main(): Promise<void> {
  const [a, b] = process.argv.slice(2);
  const desde = a ? Number(a) : 2015;
  const hasta = b ? Number(b) : 2026;
  const anios = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

  console.log(`Backfill de la Corte: ${desde}–${hasta} (${anios.length} peticiones)\n`);
  const { corridas, providencias } = await recolectar(anios);

  await mkdir("artefactos", { recursive: true });
  await writeFile(
    "artefactos/corte-relatoria.json",
    `${JSON.stringify({ _procedencia: { fuente: "relatoria/buscador_new?accion=search", rango: [desde, hasta] }, corridas, providencias }, null, 2)}\n`,
    "utf-8",
  );

  console.log(
    `\n${"ventana".padEnd(24)} ${"gate".padEnd(10)} ${"provid.".padStart(8)} ${"declara".padStart(8)}  anom.`,
  );
  for (const c of corridas) {
    console.log(
      `${`${c.ventana.fini}..${c.ventana.ffin}`.padEnd(24)} ${c.gate.outcome.padEnd(10)} ` +
        `${String(c.providencias).padStart(8)} ${String(c.totalDeclarado ?? "—").padStart(8)}  ${c.anomalias.length || "—"}`,
    );
    for (const x of c.anomalias.slice(0, 3)) console.log(`       · ${x.clase}: ${x.detalle}`);
    if (c.anomalias.length > 3) console.log(`       · … y ${c.anomalias.length - 3} más`);
    if (c.gate.outcome === "bloqueado") {
      console.log(
        `       ! ${c.gate.reglaViolada}: esperado ${c.gate.esperado}, observado ${c.gate.observado}`,
      );
    }
  }

  const bloqueadas = corridas.filter((c) => c.gate.outcome === "bloqueado").length;
  const truncadas = corridas.filter((c) => c.anomalias.some((a) => a.clase === "total-no-cuadra"));
  console.log(
    `\n${providencias.length} providencias en ${corridas.length} ventanas · ` +
      `${bloqueadas} bloqueada(s) · ${truncadas.length} truncada(s) sin resolver`,
  );
  console.log("Artefacto: artefactos/corte-relatoria.json");
  if (bloqueadas > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
