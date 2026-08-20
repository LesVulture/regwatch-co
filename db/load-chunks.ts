/**
 * Carga un artefacto de articulado en la tabla `chunk`.
 *
 * Segunda mitad del patrón del proyecto: el colector produce un artefacto
 * validado y ESTO lo importa. Nadie escribe del scraper directo a la base.
 *
 * Requiere `SUPABASE_DB_URL`, igual que `db/load.ts`. NUNCA se commitea.
 *
 * Uso:
 *   node db/load-chunks.ts artefactos/articulado-ley_1616_2013.json
 *   node db/load-chunks.ts <artefacto> --dry-run     # no conecta ni escribe
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import type { ArtefactoArticulado } from "../collectors/src/rag/run-articulado.ts";
import { generarSqlChunks } from "./import-chunks.ts";

const DRY = process.argv.includes("--dry-run");

function main(): void {
  const ruta = process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: node db/load-chunks.ts <artefacto.json> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const art = JSON.parse(readFileSync(ruta, "utf-8")) as ArtefactoArticulado;

  console.log(`artefacto : ${ruta}`);
  console.log(`norma     : ${art.norma.tipo} ${art.norma.numero} de ${art.norma.anio}`);
  console.log(`gate      : ${art.gate.outcome}`);
  console.log(`chunks    : ${art.chunks.length}`);

  // LA GUARDA QUE IMPORTA. `chunk` es de lectura pública: cargar aparato
  // editorial de Avance Jurídico lo republicaría. Se comprueba aquí y no solo
  // en el colector porque un artefacto puede ser viejo, o de antes del saneado.
  if (art.contaminados.length > 0) {
    console.error(
      `\n${art.contaminados.length} chunks con aparato editorial: ` +
        `${art.contaminados.join(", ")}\n` +
        "NO se carga. Vuelve a correr el colector con el saneado al día.",
    );
    process.exitCode = 1;
    return;
  }

  if (art.gate.outcome === "bloqueado" || art.chunks.length === 0) {
    console.error("\nEl artefacto no trae articulado utilizable. No se carga nada.");
    process.exitCode = 1;
    return;
  }

  if (DRY) {
    console.log("\n--dry-run: no se conecta ni se escribe nada.");
    console.log("Se resolvería el uuid de la norma y se generarían los INSERT.");
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

  void cargar(url, art);
}

async function cargar(url: string, art: ArtefactoArticulado): Promise<void> {
  const sql = postgres(url, { onnotice: () => {} });
  try {
    // El uuid NO viaja en el artefacto: se resuelve contra la base por la
    // identidad de la norma, que es para lo que existe `norma_identidad`.
    // Así un artefacto sigue siendo válido aunque la fila se recree.
    const filas = await sql<{ id: string }[]>`
      select id from norma
      where lower(tipo) = lower(${art.norma.tipo})
        and numero = ${art.norma.numero}
        and anio = ${art.norma.anio}
    `;

    if (filas.length !== 1) {
      console.error(
        `\nLa norma ${art.norma.tipo} ${art.norma.numero} de ${art.norma.anio} ` +
          `resuelve a ${filas.length} filas en \`norma\`. Tiene que existir ANTES: ` +
          "un chunk sin su norma sería una cita que no resuelve.",
      );
      process.exitCode = 1;
      return;
    }

    const lotes = generarSqlChunks(art.chunks, {
      fuente: "norma",
      entidadId: filas[0]?.id as string,
      tier: "primaria",
    });

    for (const [i, lote] of lotes.entries()) {
      await sql.unsafe(lote);
      console.log(`  lote ${i + 1}/${lotes.length} cargado`);
    }

    const [{ count } = { count: 0 }] = await sql<{ count: number }[]>`
      select count(*)::int as count from chunk where norma_id = ${filas[0]?.id as string}
    `;
    console.log(`\n${count} chunks en la base para esta norma.`);
  } finally {
    await sql.end();
  }
}

main();
