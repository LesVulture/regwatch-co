/**
 * Recolecta el articulado del piloto, con cortesía entre normas.
 *
 * No abre Cámara / DNP / Función Pública. Lista en `piloto.ts`.
 *
 *   node collectors/src/rag/run-piloto.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { PILOTO_ARTICULADO } from "./piloto.ts";
import { codigoSalidaArticulado, recolectarArticulado, slugBasedoc } from "./run-articulado.ts";

async function main(): Promise<void> {
  await mkdir("artefactos", { recursive: true });
  let fallos = 0;
  for (const [i, n] of PILOTO_ARTICULADO.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 3_000));
    console.log(`\n→ ${n.tipo} ${n.numero} de ${n.anio} (${n.eje})`);
    const art = await recolectarArticulado(n.tipo, n.numero, n.anio);
    const destino = `artefactos/articulado-${slugBasedoc(n.tipo, n.numero, n.anio)}.json`;
    await writeFile(destino, `${JSON.stringify(art, null, 1)}\n`);
    const code = codigoSalidaArticulado(art);
    console.log(`  gate ${art.gate.outcome} · ${art.chunks.length} chunks · ${destino}`);
    if (code !== 0) {
      fallos++;
      console.error(`  ⚠ salida ${code}`);
    }
  }
  if (fallos > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("run-piloto.ts")) await main();
