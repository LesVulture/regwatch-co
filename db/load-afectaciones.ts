/**
 * Carga candidatas de afectación ya cerradas. Segunda mitad del patrón:
 * el colector escribe el artefacto; ESTO inserta. Nadie escribe del scraper
 * a `afectacion`.
 *
 * Uso:
 *   node db/load-afectaciones.ts artefactos/afectaciones-ley_1616_2013.json
 *   node db/load-afectaciones.ts <artefacto> --dry-run
 */

import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";
import { filasDesdeBasedoc } from "../collectors/src/captura/desde-artefacto.ts";
import type { AfectacionCandidata } from "../collectors/src/senado/cerrar-leads.ts";
import type { ArtefactoBasedoc } from "../collectors/src/senado/run-basedoc.ts";
import { generarSqlAfectaciones } from "./import-afectaciones.ts";
import { generarSqlCaptura } from "./import-captura.ts";

const DRY = process.argv.includes("--dry-run");

interface ArtefactoAfectaciones {
  readonly _procedencia?: { readonly basedoc?: string };
  readonly afectada: { tipo: string; numero: string; anio: number };
  readonly candidatas: readonly AfectacionCandidata[];
  readonly huecos?: readonly { afectante: unknown; motivo: string }[];
}

function sqlCapturaDesdeBasedoc(art: ArtefactoAfectaciones): string[] {
  const ruta = art._procedencia?.basedoc;
  if (!ruta || !existsSync(ruta)) return [];
  const basedoc = JSON.parse(readFileSync(ruta, "utf-8")) as ArtefactoBasedoc;
  return generarSqlCaptura(filasDesdeBasedoc(basedoc));
}

async function resolverNorma(
  sql: postgres.Sql,
  n: { tipo: string; numero: string; anio: number },
): Promise<string | null> {
  const filas = await sql<{ id: string }[]>`
    select id from norma
    where lower(tipo) = lower(${n.tipo})
      and numero = ${n.numero}
      and anio = ${n.anio}
  `;
  return filas[0]?.id ?? null;
}

function main(): void {
  const ruta = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!ruta) {
    console.error("uso: node db/load-afectaciones.ts <artefacto.json> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const art = JSON.parse(readFileSync(ruta, "utf-8")) as ArtefactoAfectaciones;
  const captura = sqlCapturaDesdeBasedoc(art);
  console.log(`artefacto  : ${ruta}`);
  console.log(`afectada   : ${art.afectada.tipo} ${art.afectada.numero} de ${art.afectada.anio}`);
  console.log(`candidatas : ${art.candidatas.length}`);
  console.log(`huecos     : ${art.huecos?.length ?? 0}`);
  console.log(`captura    : ${captura.length} lote(s) (blob_uri NULL; no hay R2)`);

  if (DRY) {
    console.log("\n--dry-run: no se conecta ni se escribe nada.");
    return;
  }

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("\nFalta SUPABASE_DB_URL. Está en .env (gitignored).");
    process.exitCode = 1;
    return;
  }

  void cargar(url, art, captura);
}

async function cargar(url: string, art: ArtefactoAfectaciones, captura: string[]): Promise<void> {
  const sql = postgres(url, { onnotice: () => {} });
  try {
    if (captura.length > 0) {
      await sql.begin(async (tx) => {
        for (const lote of captura) await tx.unsafe(lote);
      });
    }

    if (art.candidatas.length === 0) {
      console.error(
        "\nNo hay candidatas. Un lead sin cláusula no es arista; la captura sí se escribió.",
      );
      process.exitCode = 1;
      return;
    }

    const destinos = [];
    for (const c of art.candidatas) {
      const afectanteId = await resolverNorma(sql, c.afectante);
      const afectadaId = await resolverNorma(sql, c.afectada);
      if (!afectanteId || !afectadaId) {
        console.error(
          `\nFalta la fila de norma para ` +
            `${c.afectante.tipo} ${c.afectante.numero}/${c.afectante.anio} ` +
            `→ ${c.afectada.tipo} ${c.afectada.numero}/${c.afectada.anio}. ` +
            "Carga primero el articulado con --crear-norma. No se inventa el uuid.",
        );
        process.exitCode = 1;
        return;
      }
      destinos.push({ afectanteId, afectadaId });
    }

    const lotes = generarSqlAfectaciones(art.candidatas, destinos);
    await sql.begin(async (tx) => {
      for (const lote of lotes) await tx.unsafe(lote);
    });
    console.log(`\n${art.candidatas.length} arista(s) en afectacion.`);
  } finally {
    await sql.end();
  }
}

main();
