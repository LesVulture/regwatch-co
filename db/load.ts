/**
 * Carga el artefacto validado en Postgres. Un comando, con credenciales.
 *
 * Por qué existe como script y no lo hace un agente a mano: mover 1,3 MB de SQL
 * por la ventana de contexto de un LLM para cargar datos que el colector
 * regenera en diez segundos es, además de caro, frágil. Esto es trabajo de
 * máquina y aquí se queda.
 *
 * Requiere `SUPABASE_DB_URL` (Session pooler o conexión directa, con la
 * contraseña de la base). NUNCA se commitea: vive en `.env`, que está en
 * `.gitignore`, y `.env.example` solo lleva el hueco.
 *
 * Uso:
 *   SUPABASE_DB_URL='postgresql://...' node db/load.ts
 *   node db/load.ts --dry-run      # imprime el plan y no toca nada
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { generarSql } from "./import-proyectos.ts";

const DRY = process.argv.includes("--dry-run");
const ARTEFACTO = "artefactos/senado-pdly.json";

function main(): void {
  const art = JSON.parse(readFileSync(ARTEFACTO, "utf-8"));
  const lotes = generarSql(art, 500);
  const total = art.proyectos.length;

  console.log(`artefacto : ${ARTEFACTO}`);
  console.log(`proyectos : ${total}`);
  console.log(`lotes     : ${lotes.length}`);

  if (DRY) {
    console.log("\n--dry-run: no se conecta ni se escribe nada.");
    console.log(`SQL que se ejecutaría: ${lotes.join("\n").length} bytes`);
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

  void cargar(url, lotes, total);
}

async function cargar(url: string, lotes: string[], total: number): Promise<void> {
  const sql = postgres(url, { onnotice: () => {} });
  try {
    // Todo o nada: una carga a medias deja la base en un estado que nadie
    // declaró, y este proyecto vive de que el estado sea siempre declarable.
    await sql.begin(async (tx) => {
      for (const [i, lote] of lotes.entries()) {
        await tx.unsafe(lote);
        console.log(`  lote ${i + 1}/${lotes.length} ok`);
      }
    });

    const filas = await sql<{ count: number }[]>`select count(*)::int as count from proyecto_ley`;
    const pendientes = await sql<
      { count: number }[]
    >`select count(*)::int as count from proyecto_ley where requiere_revision`;
    const count = filas[0]?.count ?? 0;
    const revision = pendientes[0]?.count ?? 0;
    console.log(`\n${count} filas en proyecto_ley (se enviaron ${total})`);
    console.log(`${revision} en cola de revisión humana`);
    if (count < total) {
      console.error("Hay menos filas de las enviadas: revisar conflictos.");
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main();
