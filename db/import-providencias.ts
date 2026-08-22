/**
 * Importador: artefacto de la relatoría → SQL para `providencia`.
 *
 * Existe porque la tabla no tenía escritor. `collect:corte` lleva desde su
 * primer día produciendo 21.665 providencias en un artefacto validado y no
 * había manera de meterlas en la base: `busqueda_lexica` unía tres tablas y una
 * de ellas estaba siempre vacía, así que la mitad jurisprudencial del producto
 * devolvía cero filas sin que nada fallara. Es el mismo defecto de productor
 * sin consumidor que motivó `import-chunks.ts`.
 *
 * Puro a propósito, igual que `import-proyectos.ts`: genera texto, no se
 * conecta a nada. Se prueba sin credenciales.
 *
 * **No inventa procedencia.** Cada providencia hereda la URL y el `captured_at`
 * de LA VENTANA que la devolvió, no del año: un año se parte en varias
 * consultas y atribuirle a una fila la URL de otra ventana es el modo de fallo
 * «procedencia falsificada» de CLAUDE.md. El artefacto trae `ventanaIdx` para
 * eso, y aquí se exige — un artefacto viejo sin ese campo se rechaza en vez de
 * rellenarse con la primera corrida del año.
 *
 * Uso:  node db/import-providencias.ts [--lotes=500] > /tmp/import.sql
 */

import { readFileSync } from "node:fs";

/** Los 4 tipos que el esquema conoce. Cualquier otro va a `desconocido`. */
const TIPOS_CONOCIDOS = new Set([
  "Auto",
  "Tutela",
  "Constitucionalidad",
  "Sentencia de unificación",
]);

function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

/** Fecha o NULL. Nunca «hoy», nunca una inferida. */
function fecha(v: string | null | undefined): string {
  return v ? `${lit(v)}::date` : "NULL";
}

export interface ProvidenciaArtefacto {
  readonly anio: number;
  readonly ventanaIdx?: number;
  readonly id: number;
  readonly sentencia: string;
  readonly tipo: string;
  readonly tipoDesconocido: boolean;
  readonly fechaPublicacion: string | null;
  readonly fechaSentencia: string | null;
  readonly expediente: string;
  readonly magistrados: readonly string[];
  readonly tema: string;
  readonly urlTexto: string | null;
  readonly raw: { readonly rutahtml?: string };
}

export interface CorridaArtefacto {
  readonly anio: number;
  readonly ventana: { readonly fini: string; readonly ffin: string };
  readonly gate: {
    readonly outcome: string;
    readonly url?: string;
    readonly reglaViolada?: string;
    readonly sourceKey?: string;
  };
  readonly capturedAt: string;
  readonly url?: string;
  readonly contentType?: string | null;
  readonly httpStatus?: number;
  readonly bytes?: number;
  readonly contentHash?: string;
}

export interface ArtefactoCorte {
  readonly corridas: readonly CorridaArtefacto[];
  readonly providencias: readonly ProvidenciaArtefacto[];
}

/** Una fila que NO se carga, y por qué. Se devuelve, no se traga. */
export interface Excluida {
  readonly fuenteId: number;
  readonly sentencia: string;
  readonly motivo: string;
}

const COLUMNAS = [
  "fuente_id",
  "sentencia",
  "tipo",
  "tipo_original",
  "requiere_revision",
  "fecha_publicacion",
  "fecha_sentencia",
  "expediente",
  "magistrados",
  "tema",
  "rutahtml",
  "url_texto",
  "url_fuente",
  "captured_at",
  "tier",
].join(", ");

/**
 * Convierte el artefacto en lotes de INSERT, y devuelve aparte lo que no se
 * puede cargar sin violar el esquema.
 *
 * Excluir declarando es distinto de fallar: 21.660 filas buenas no se quedan
 * fuera porque una traiga una fecha imposible, y la que se queda fuera sale
 * nombrada en la salida del cargador en vez de desaparecer.
 */
export function generarSqlProvidencias(
  art: ArtefactoCorte,
  tamLote = 500,
): { lotes: string[]; excluidas: Excluida[] } {
  const excluidas: Excluida[] = [];
  const filas: string[] = [];
  const vistos = new Map<number, number>();

  for (const p of art.providencias) {
    if (typeof p.ventanaIdx !== "number") {
      throw new Error(
        `la providencia ${p.id} no trae \`ventanaIdx\`. El artefacto es anterior a la ` +
          "procedencia por ventana: vuelve a correr `pnpm collect:corte`. " +
          "Atribuirle la URL de otra ventana del mismo año sería procedencia falsificada.",
      );
    }
    const corrida = art.corridas[p.ventanaIdx];
    if (!corrida) {
      throw new Error(`la providencia ${p.id} apunta a la ventana ${p.ventanaIdx}, que no existe`);
    }

    const anterior = vistos.get(p.id);
    if (anterior !== undefined) {
      // Dos filas con el mismo `fuente_id` en un solo INSERT no dan un
      // duplicado: hacen fallar la sentencia entera («ON CONFLICT DO UPDATE
      // command cannot affect row a second time»). Se excluye la repetida.
      excluidas.push({
        fuenteId: p.id,
        sentencia: p.sentencia,
        motivo: `duplicado en el artefacto (ya vino en la ventana ${anterior})`,
      });
      continue;
    }

    const rutahtml = p.raw?.rutahtml?.trim() ?? "";
    const urlVentana = corrida.gate.url;

    if (!p.sentencia?.trim()) {
      excluidas.push({ fuenteId: p.id, sentencia: p.sentencia, motivo: "sentencia vacía" });
      continue;
    }
    if (!rutahtml) {
      excluidas.push({ fuenteId: p.id, sentencia: p.sentencia, motivo: "sin `rutahtml`" });
      continue;
    }
    if (!p.urlTexto) {
      // `url_texto` es NOT NULL y del dominio `url_fuente`. Sin ella no hay
      // dónde comprobar la providencia, que es la única razón de guardarla.
      excluidas.push({ fuenteId: p.id, sentencia: p.sentencia, motivo: "sin URL de texto" });
      continue;
    }
    if (!urlVentana) {
      excluidas.push({
        fuenteId: p.id,
        sentencia: p.sentencia,
        motivo: `la ventana ${p.ventanaIdx} no registró su URL de consulta`,
      });
      continue;
    }
    if (p.fechaSentencia && p.fechaPublicacion && p.fechaSentencia > p.fechaPublicacion) {
      // El CHECK del esquema la rechaza. Corregir la fecha «por sensatez» sería
      // inventar; se declara y se deja fuera.
      excluidas.push({
        fuenteId: p.id,
        sentencia: p.sentencia,
        motivo: `fecha de sentencia (${p.fechaSentencia}) posterior a la de publicación (${p.fechaPublicacion})`,
      });
      continue;
    }

    vistos.set(p.id, p.ventanaIdx);

    // El tipo no se adjudica por parecido: o es uno de los cuatro medidos, o va
    // a `desconocido` CON `requiere_revision`, que es lo que el CHECK exige.
    const conocido = !p.tipoDesconocido && TIPOS_CONOCIDOS.has(p.tipo);
    const tipo = conocido ? p.tipo : "desconocido";

    filas.push(
      `(${[
        String(p.id),
        lit(p.sentencia),
        `${lit(tipo)}::tipo_providencia`,
        lit(p.tipo ?? ""),
        String(!conocido),
        fecha(p.fechaPublicacion),
        fecha(p.fechaSentencia),
        lit(p.expediente ?? ""),
        `ARRAY[${(p.magistrados ?? []).map(lit).join(", ")}]::text[]`,
        lit(p.tema ?? ""),
        lit(rutahtml),
        lit(p.urlTexto),
        lit(urlVentana),
        `${lit(corrida.capturedAt)}::timestamptz`,
        "'primaria'::tier_evidencia",
      ].join(", ")})`,
    );
  }

  const lotes: string[] = [];
  for (let i = 0; i < filas.length; i += tamLote) {
    lotes.push(
      `insert into providencia (${COLUMNAS}) values\n${filas.slice(i, i + tamLote).join(",\n")}\n` +
        // Re-importar refresca: la relatoría corrige temas y fechas de
        // publicación de providencias ya indexadas.
        "on conflict (fuente_id) do update set\n" +
        "  sentencia = excluded.sentencia,\n" +
        "  tipo = excluded.tipo,\n" +
        "  tipo_original = excluded.tipo_original,\n" +
        "  requiere_revision = excluded.requiere_revision,\n" +
        "  fecha_publicacion = excluded.fecha_publicacion,\n" +
        "  fecha_sentencia = excluded.fecha_sentencia,\n" +
        "  expediente = excluded.expediente,\n" +
        "  magistrados = excluded.magistrados,\n" +
        "  tema = excluded.tema,\n" +
        "  rutahtml = excluded.rutahtml,\n" +
        "  url_texto = excluded.url_texto,\n" +
        "  url_fuente = excluded.url_fuente,\n" +
        "  captured_at = excluded.captured_at;",
    );
  }

  return { lotes, excluidas };
}

function main(): void {
  const argLote = process.argv.find((a) => a.startsWith("--lotes="));
  const tam = argLote ? Number(argLote.split("=")[1]) : 500;
  // Sin esto, `--lotes=0` cuelga el proceso en un bucle que nunca avanza y
  // `--lotes=abc` emite SQL partido en trozos de `NaN` y sale con código 0: un
  // fallo silencioso que produce un artefacto roto con aspecto de bueno.
  if (!Number.isInteger(tam) || tam < 1) {
    console.error(`--lotes tiene que ser un entero ≥ 1, y llegó «${argLote?.split("=")[1]}».`);
    process.exitCode = 1;
    return;
  }
  const art = JSON.parse(
    readFileSync("artefactos/corte-relatoria.json", "utf-8"),
  ) as ArtefactoCorte;
  const { lotes, excluidas } = generarSqlProvidencias(art, tam);
  console.error(
    `${art.providencias.length} providencias → ${lotes.length} lotes de ${tam} · ` +
      `${excluidas.length} excluida(s)`,
  );
  console.log(lotes.join("\n\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
