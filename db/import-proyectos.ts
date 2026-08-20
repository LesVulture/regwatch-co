/**
 * Importador: artefacto validado → SQL.
 *
 * El colector NO escribe en la base. Emite un artefacto; este módulo lo
 * convierte en SQL revisable. Esa separación es la barrera anti-basura del
 * patrón `scraper → artefacto → import`, y aquí además permite leer el SQL
 * antes de que toque nada.
 *
 * **No inventa valores.** Si un campo no vino, va NULL o cadena vacía según lo
 * que declare la columna; nada se rellena «por sensatez».
 *
 * Uso:  node db/import-proyectos.ts [--lotes=200] > /tmp/import.sql
 */

import { readFileSync } from "node:fs";

/** Escapa un literal de texto para SQL. Sin esto, un título con apóstrofo rompe. */
function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

interface ProyectoArtefacto {
  legislatura: string;
  id: number;
  numeroSenadoCanonico: string | null;
  numeroSenadoRaw: string;
  crosswalk: { estado: string; motivo: string; residuo: string[] };
  titulo: string;
  autor: string;
  comision: string;
  cuatrenio: string;
  estado: {
    canonico: string;
    original: string;
    requiereRevision: boolean;
    camaraMencionada: "senado" | "camara" | null;
  };
  raw: { numero_camara: string };
}

interface Artefacto {
  _procedencia: { fuente: string; generado: string };
  corridas: { legislatura: string; capturedAt: string }[];
  proyectos: ProyectoArtefacto[];
}

const COLUMNAS = [
  "fuente_id",
  "legislatura",
  "cuatrenio",
  "numero_senado_raw",
  "numero_senado_canonico",
  "numero_camara_raw",
  "crosswalk",
  "crosswalk_motivo",
  "crosswalk_residuo",
  "titulo",
  "autor",
  "comision",
  "estado",
  "estado_original",
  "estado_camara",
  "requiere_revision",
  "url_fuente",
  "captured_at",
  "tier",
].join(", ");

export function generarSql(art: Artefacto, tamLote: number): string[] {
  // La fecha de captura de CADA proyecto es la de la corrida de su legislatura,
  // no `now()`: la procedencia es cuándo se pidió el dato, no cuándo se importó.
  const capturaPorLeg = new Map(art.corridas.map((c) => [c.legislatura, c.capturedAt]));
  const url = "https://leyes.senado.gov.co/api/search_pdly.php";

  const filas = art.proyectos.map((p) => {
    const captured = capturaPorLeg.get(p.legislatura);
    if (!captured) throw new Error(`sin captured_at para la legislatura ${p.legislatura}`);
    return (
      "(" +
      [
        String(p.id),
        lit(p.legislatura),
        lit(p.cuatrenio),
        lit(p.numeroSenadoRaw),
        lit(p.numeroSenadoCanonico),
        lit(p.raw.numero_camara ?? ""),
        `${lit(p.crosswalk.estado)}::estado_crosswalk`,
        lit(p.crosswalk.motivo),
        // Array de Postgres. Se construye con literales escapados, no concatenando.
        `ARRAY[${p.crosswalk.residuo.map(lit).join(", ")}]::text[]`,
        lit(p.titulo),
        lit(p.autor),
        lit(p.comision),
        `${lit(p.estado.canonico)}::estado_tramite`,
        lit(p.estado.original),
        p.estado.camaraMencionada ? `${lit(p.estado.camaraMencionada)}::camara` : "NULL",
        String(p.estado.requiereRevision || p.crosswalk.residuo.length > 0),
        lit(url),
        `${lit(captured)}::timestamptz`,
        "'primaria'::tier_evidencia",
      ].join(", ") +
      ")"
    );
  });

  const lotes: string[] = [];
  for (let i = 0; i < filas.length; i += tamLote) {
    const trozo = filas.slice(i, i + tamLote);
    lotes.push(
      `insert into proyecto_ley (${COLUMNAS}) values\n${trozo.join(",\n")}\n` +
        // Re-importar no duplica ni pisa a ciegas: actualiza lo que cambió.
        `on conflict (fuente_id) do update set\n` +
        `  estado = excluded.estado,\n` +
        `  estado_original = excluded.estado_original,\n` +
        `  estado_camara = excluded.estado_camara,\n` +
        `  requiere_revision = excluded.requiere_revision,\n` +
        `  crosswalk = excluded.crosswalk,\n` +
        `  crosswalk_motivo = excluded.crosswalk_motivo,\n` +
        `  crosswalk_residuo = excluded.crosswalk_residuo,\n` +
        `  numero_camara_raw = excluded.numero_camara_raw,\n` +
        `  captured_at = excluded.captured_at;`,
    );
  }
  return lotes;
}

function main(): void {
  const argLote = process.argv.find((a) => a.startsWith("--lotes="));
  const tam = argLote ? Number(argLote.split("=")[1]) : 200;
  const art = JSON.parse(readFileSync("artefactos/senado-pdly.json", "utf-8")) as Artefacto;
  const lotes = generarSql(art, tam);
  console.error(`${art.proyectos.length} proyectos → ${lotes.length} lotes de ${tam}`);
  console.log(lotes.join("\n\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
