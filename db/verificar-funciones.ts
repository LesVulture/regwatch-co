/**
 * ¿Los ficheros de `db/schemas/` pueden reconstruir de verdad las funciones?
 *
 * `db/schema.test.ts` compara el INVENTARIO del snapshot contra lo desplegado:
 * qué tablas, qué columnas, qué funciones existen. No mira los CUERPOS, y esa
 * es la costura por la que se coló el fallo del 2026-08-20: `06_busqueda.sql`
 * llevaba tiempo sin ser ejecutable —le faltaban los alias de columna del
 * `union all`— y el test seguía verde porque la función SÍ existía en la
 * instancia. El fichero no describía la base: describía otra cosa parecida.
 *
 * Esto lo comprueba de la única forma que no admite discusión: ejecutando cada
 * `create or replace function` del repo contra el catálogo real, dentro de una
 * transacción que SIEMPRE se revierte. Con `check_function_bodies = on` (el
 * defecto de Postgres) una función `language sql` se parsea contra las tablas
 * de verdad, así que una columna que no existe falla aquí y no seis meses
 * después, en el despliegue de otra persona.
 *
 * No vive en `pnpm verify` a propósito: necesita conexión, y `verify` tiene que
 * poder correr en CI sin credenciales. Se corre a mano tras tocar un `.sql`:
 *
 *   pnpm db:drift
 *
 * Sale 1 si alguna no es ejecutable, y NO escribe nada en ningún caso.
 */

import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

const DIR = "db/schemas";

interface Bloque {
  readonly nombre: string;
  readonly fichero: string;
  readonly sql: string;
}

/**
 * Corta los `create [or replace] function … $$;` de un fichero.
 *
 * Deliberadamente tonto: los ficheros del repo usan `$$` como delimitador y
 * nada más. Si alguien introduce otro delimitador, esto dejará de encontrar su
 * función — y el conteo contra la instancia, más abajo, lo dirá. Prefiero que
 * avise a que adivine.
 */
export function bloquesDeFuncion(texto: string, fichero: string): Bloque[] {
  const out: Bloque[] = [];
  let dentro: string[] | null = null;
  for (const linea of texto.split("\n")) {
    if (/^create\s+(or\s+replace\s+)?function/i.test(linea)) dentro = [linea];
    else if (dentro) {
      dentro.push(linea);
      if (/^\$\$;/.test(linea)) {
        const m = dentro[0]?.match(/function\s+(?:public\.)?(\w+)/i);
        out.push({ nombre: m?.[1] ?? "(sin nombre)", fichero, sql: dentro.join("\n") });
        dentro = null;
      }
    }
  }
  if (dentro !== null) {
    throw new Error(`${fichero}: una función se queda sin cerrar ($$; ausente)`);
  }
  return out;
}

async function main(): Promise<void> {
  const bloques = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => bloquesDeFuncion(readFileSync(`${DIR}/${f}`, "utf-8"), `${DIR}/${f}`));

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Falta SUPABASE_DB_URL. Está en .env (gitignored).");
    process.exitCode = 1;
    return;
  }

  const sql = postgres(url, { onnotice: () => {} });
  let fallos = 0;
  try {
    for (const b of bloques) {
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe("set local check_function_bodies = on");
          await tx.unsafe(b.sql);
          // La única salida de esta transacción. Comprobar es ejecutar; dejarlo
          // ejecutado sería desplegar sin migración y a espaldas del snapshot.
          throw new Error("__REVERTIR__");
        });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === "__REVERTIR__") {
          console.log(`ok    ${b.nombre.padEnd(20)} ${b.fichero}`);
          continue;
        }
        fallos++;
        console.log(`FALLA ${b.nombre.padEnd(20)} ${b.fichero}`);
        console.log(`      ${msg.split("\n")[0]}`);
      }
    }

    // El repo puede tener MENOS funciones que la instancia: eso es una función
    // desplegada que ningún fichero reconstruye, y también es deriva.
    const vivas = await sql<{ proname: string }[]>`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'`;
    const enRepo = new Set(bloques.map((b) => b.nombre));
    const huerfanas = vivas.map((v) => v.proname).filter((n) => !enRepo.has(n));
    if (huerfanas.length > 0) {
      fallos++;
      console.log(`\nDesplegadas y sin fichero que las reconstruya: ${huerfanas.join(", ")}`);
    }

    console.log(
      fallos === 0
        ? `\nLas ${bloques.length} funciones del repo son ejecutables contra la instancia.`
        : `\n${fallos} problema(s) de deriva.`,
    );
    process.exitCode = fallos === 0 ? 0 : 1;
  } finally {
    await sql.end();
  }
}

// Solo corre cuando se invoca como script. Sin esta guarda, importar
// `bloquesDeFuncion` desde un test abriría una conexión a la instancia real —y
// `pnpm verify` tiene que poder correr sin credenciales.
if (import.meta.filename === process.argv[1]) await main();
