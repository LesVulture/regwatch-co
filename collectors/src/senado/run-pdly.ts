/**
 * Recolección de proyectos de ley del Senado, de punta a punta.
 *
 * fetch → gate 0 → parse → **artefacto intermedio validado**.
 *
 * El artefacto es deliberado y no un paso de más: el patrón que comparten los
 * comparables serios (Open States entre ellos) es
 * `scraper → artefacto validado → import`, y **nadie escribe del scraper
 * directo a la base**. La validación intermedia es la barrera anti-basura, y
 * aquí además es lo que permite revisar una corrida antes de que toque datos.
 *
 * Uso:
 *   pnpm collect:senado                 # ventana por defecto (2022-2027)
 *   pnpm collect:senado 2024 2026       # rango explícito
 */

import { mkdir, writeFile } from "node:fs/promises";
import { g0Contrato } from "../gates/g0-contrato.ts";
import { depsPorDefecto, type HttpDeps, pedir } from "../http.ts";
import { type Anomalia, legislaturas, parsePdly, peticionLegislatura } from "./pdly.ts";

export interface CorridaLegislatura {
  readonly legislatura: string;
  readonly gate: ReturnType<typeof g0Contrato>;
  readonly httpStatus: number;
  readonly bytes: number;
  readonly contentHash: string;
  readonly capturedAt: string;
  readonly proyectos: number;
  readonly totalDeclarado: number | null;
  readonly anomalias: readonly Anomalia[];
}

export interface Artefacto {
  readonly _procedencia: {
    readonly generado: string;
    readonly fuente: string;
    readonly user_agent: string;
    readonly ventana: readonly string[];
  };
  readonly corridas: readonly CorridaLegislatura[];
  readonly proyectos: readonly unknown[];
}

export async function recolectar(
  ventana: readonly string[],
  deps: HttpDeps = depsPorDefecto,
): Promise<Artefacto> {
  const corridas: CorridaLegislatura[] = [];
  const proyectos: unknown[] = [];

  for (const [i, leg] of ventana.entries()) {
    if (i > 0) await deps.sleep(2_000); // cortesía entre peticiones

    const { capture, body } = await pedir(peticionLegislatura(leg), deps);
    const gate = g0Contrato(capture, body);

    // Una captura BLOQUEADA se registra igual: es evidencia de que la fuente
    // se rompió, y el punto de replay. Lo que no se hace es parsearla.
    if (gate.outcome === "bloqueado") {
      corridas.push({
        legislatura: leg,
        gate,
        httpStatus: capture.httpStatus,
        bytes: capture.byteLength,
        contentHash: capture.contentHash,
        capturedAt: capture.capturedAt,
        proyectos: 0,
        totalDeclarado: null,
        anomalias: [],
      });
      continue;
    }

    const r = parsePdly(new TextDecoder("utf-8").decode(body));
    corridas.push({
      legislatura: leg,
      gate,
      httpStatus: capture.httpStatus,
      bytes: capture.byteLength,
      contentHash: capture.contentHash,
      capturedAt: capture.capturedAt,
      proyectos: r.proyectos.length,
      totalDeclarado: r.totalDeclarado,
      anomalias: r.anomalias,
    });
    for (const p of r.proyectos) proyectos.push({ legislatura: leg, ...p });
  }

  return {
    _procedencia: {
      generado: deps.now().toISOString(),
      fuente: "POST https://leyes.senado.gov.co/api/search_pdly.php",
      user_agent: process.env.REGWATCH_USER_AGENT ?? "regwatch-co/0.1",
      ventana,
    },
    corridas,
    proyectos,
  };
}

async function main(): Promise<void> {
  const [a, b] = process.argv.slice(2);
  const ventana = legislaturas(a ? Number(a) : 2022, b ? Number(b) : 2027);

  console.log(`Ventana: ${ventana.join(", ")}`);
  const art = await recolectar(ventana);

  await mkdir("artefactos", { recursive: true });
  const destino = "artefactos/senado-pdly.json";
  await writeFile(destino, `${JSON.stringify(art, null, 2)}\n`, "utf-8");

  console.log(
    `\n${"legislatura".padEnd(12)} ${"gate".padEnd(10)} ${"filas".padStart(6)} ${"declara".padStart(8)}  anomalías`,
  );
  for (const c of art.corridas) {
    const anom = c.anomalias.length ? `${c.anomalias.length}` : "—";
    console.log(
      `${c.legislatura.padEnd(12)} ${c.gate.outcome.padEnd(10)} ${String(c.proyectos).padStart(6)} ${String(c.totalDeclarado ?? "—").padStart(8)}  ${anom}`,
    );
    for (const x of c.anomalias.slice(0, 5)) console.log(`             · ${x.clase}: ${x.detalle}`);
    if (c.anomalias.length > 5) console.log(`             · … y ${c.anomalias.length - 5} más`);
    if (c.gate.outcome === "bloqueado") {
      console.log(
        `             ! ${c.gate.reglaViolada}: esperado ${c.gate.esperado}, observado ${c.gate.observado}`,
      );
    }
  }

  const total = art.proyectos.length;
  const bloqueadas = art.corridas.filter((c) => c.gate.outcome === "bloqueado").length;
  console.log(`\n${total} proyectos · ${bloqueadas} legislatura(s) bloqueada(s) por el gate`);
  console.log(`Artefacto: ${destino}`);

  // Salir 1 si algo quedó bloqueado: en CI eso tiene que romper la corrida.
  if (bloqueadas > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
