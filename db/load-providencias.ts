/**
 * Carga el artefacto de la relatoría en la tabla `providencia`.
 *
 * Segunda mitad del patrón del proyecto: el colector produce un artefacto
 * validado y ESTO lo importa. Nadie escribe del scraper directo a la base.
 *
 * Requiere `SUPABASE_DB_URL`, igual que `db/load.ts`. NUNCA se commitea.
 *
 * Uso:
 *   pnpm db:load-providencias
 *   pnpm db:load-providencias -- --dry-run     # no conecta ni escribe
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { type ArtefactoCorte, generarSqlProvidencias } from "./import-providencias.ts";

const DRY = process.argv.includes("--dry-run");
const ARTEFACTO =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "artefactos/corte-relatoria.json";

function main(): void {
  const art = JSON.parse(readFileSync(ARTEFACTO, "utf-8")) as ArtefactoCorte;

  // Una ventana bloqueada no aportó filas, pero SÍ cambia lo que significa el
  // total: el corpus está incompleto y hay que decirlo antes de cargar.
  const bloqueadas = art.corridas.filter((c) => c.gate.outcome === "bloqueado");

  const { lotes, excluidas } = generarSqlProvidencias(art);
  const aCargar = art.providencias.length - excluidas.length;

  console.log(`artefacto    : ${ARTEFACTO}`);
  console.log(`ventanas     : ${art.corridas.length} (${bloqueadas.length} bloqueada(s))`);
  console.log(`providencias : ${art.providencias.length}`);
  console.log(`a cargar     : ${aCargar} en ${lotes.length} lote(s)`);

  if (excluidas.length > 0) {
    console.log(`\n${excluidas.length} excluida(s), con motivo:`);
    for (const e of excluidas.slice(0, 20)) {
      console.log(`  · ${e.sentencia} (fuente_id ${e.fuenteId}): ${e.motivo}`);
    }
    if (excluidas.length > 20) console.log(`  · … y ${excluidas.length - 20} más`);
  }

  if (DRY) {
    console.log("\n--dry-run: no se conecta ni se escribe nada.");
    console.log(`SQL que se ejecutaría: ${lotes.join("\n").length} bytes`);
    return;
  }

  if (lotes.length === 0) {
    console.error("\nNo hay nada que cargar.");
    process.exitCode = 1;
    return;
  }

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      "\nFalta SUPABASE_DB_URL.\n" +
        "Está en Supabase → Project Settings → Database → Connection string.\n" +
        "Ponla en .env (gitignored). NO la pegues en el repo ni en un commit.",
    );
    process.exitCode = 1;
    return;
  }

  void cargar(url, lotes, aCargar, excluidas.length);
}

async function cargar(
  url: string,
  lotes: string[],
  esperadas: number,
  excluidas: number,
): Promise<void> {
  const sql = postgres(url, { onnotice: () => {} });
  try {
    // Todo o nada, igual que `db/load.ts`: una carga a medias deja la base en
    // un estado que nadie declaró.
    await sql.begin(async (tx) => {
      for (const [i, lote] of lotes.entries()) {
        await tx.unsafe(lote);
        console.log(`  lote ${i + 1}/${lotes.length} ok`);
      }
    });

    const [filas] = await sql<{ total: number; revision: number }[]>`select count(*)::int as total,
             count(*) filter (where requiere_revision)::int as revision
        from providencia`;
    const total = filas?.total ?? 0;
    console.log(`\n${total} filas en providencia (se enviaron ${esperadas})`);
    console.log(`${filas?.revision ?? 0} con tipo desconocido, en cola de revisión humana`);

    if (total < esperadas) {
      console.error("Hay menos filas de las enviadas: revisar conflictos.");
      process.exitCode = 1;
    }
    // Salir en 1 con exclusiones es deliberado: la carga fue buena y el corpus
    // está incompleto a la vez. Un verde liso escondería la segunda mitad.
    if (excluidas > 0) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
