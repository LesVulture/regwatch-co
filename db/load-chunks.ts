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
 *   node db/load-chunks.ts <artefacto> --crear-norma  # da de alta la norma
 *   node db/load-chunks.ts <artefacto> --dry-run     # no conecta ni escribe
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { filasDesdeArticulado } from "../collectors/src/captura/desde-artefacto.ts";
import type { ArtefactoArticulado } from "../collectors/src/rag/run-articulado.ts";
import { generarSqlCaptura } from "./import-captura.ts";
import { generarSqlChunks } from "./import-chunks.ts";

const DRY = process.argv.includes("--dry-run");
/**
 * Da de alta la norma si no existe, con el epígrafe del artefacto.
 *
 * No es el defecto a propósito: crear filas en `norma` es lo que decide qué
 * existe en el corpus, y quiero que sea una decisión escrita en el comando y no
 * un efecto secundario de cargar chunks.
 */
const CREAR = process.argv.includes("--crear-norma");

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

    let normaId = filas[0]?.id;

    if (filas.length === 0 && CREAR) {
      // El título sale del EPÍGRAFE de la propia ley (`rag/epigrafe.ts`), no de
      // ninguna inferencia. Sin epígrafe no se crea nada: `norma.titulo` es la
      // única columna de esta tabla que un humano tendría la tentación de
      // rellenar «de memoria», y de ahí a un corpus con títulos aproximados hay
      // un paso.
      if (!art.norma.titulo) {
        console.error(
          `\nNo se pudo extraer el epígrafe de ${art.norma.tipo} ${art.norma.numero} ` +
            `de ${art.norma.anio}, así que no hay título comprobable y NO se crea la fila.\n` +
            "Vuelve a correr `pnpm collect:articulado` y mira qué devolvió la fuente.",
        );
        process.exitCode = 1;
        return;
      }
      const [creada] = await sql<{ id: string }[]>`
        insert into norma (tipo, numero, anio, titulo, url_fuente, captured_at, tier)
        values (${art.norma.tipo.toLowerCase()}, ${art.norma.numero}, ${art.norma.anio},
                ${art.norma.titulo}, ${art._procedencia.url},
                ${art._procedencia.generado}::timestamptz, 'primaria')
        returning id`;
      normaId = creada?.id;
      console.log(`\nnorma creada: ${art.norma.tipo} ${art.norma.numero} de ${art.norma.anio}`);
      console.log(`  título: ${art.norma.titulo}`);
      // `diario_oficial` y `fecha_publicacion` quedan en NULL: la compilación no
      // los publica en esta página y un NULL honesto vale más que una fecha
      // plausible.
      console.log("  diario oficial y fecha de publicación: NULL (no constan en esta fuente)");
    }

    if (!normaId) {
      console.error(
        `\nLa norma ${art.norma.tipo} ${art.norma.numero} de ${art.norma.anio} ` +
          `resuelve a ${filas.length} filas en \`norma\`. Tiene que existir ANTES: ` +
          "un chunk sin su norma sería una cita que no resuelve.\n" +
          (filas.length === 0 ? "Añade `--crear-norma` para darla de alta con su epígrafe." : ""),
      );
      process.exitCode = 1;
      return;
    }

    const captura = generarSqlCaptura(filasDesdeArticulado(art));
    const lotes = generarSqlChunks(art.chunks, {
      fuente: "norma",
      entidadId: normaId,
      tier: "primaria",
    });

    for (const [i, lote] of captura.entries()) {
      await sql.unsafe(lote);
      console.log(`  captura lote ${i + 1}/${captura.length} ok`);
    }
    for (const [i, lote] of lotes.entries()) {
      await sql.unsafe(lote);
      console.log(`  lote ${i + 1}/${lotes.length} cargado`);
    }

    const [{ count } = { count: 0 }] = await sql<{ count: number }[]>`
      select count(*)::int as count from chunk where norma_id = ${normaId}
    `;
    console.log(`\n${count} chunks en la base para esta norma.`);
  } finally {
    await sql.end();
  }
}

main();
