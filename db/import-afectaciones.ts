/**
 * INSERT de `afectacion` a partir de candidatas ya cerradas.
 *
 * Puro. Las normas tienen que existir: esta capa no crea filas en `norma`
 * (eso es `--crear-norma` en load-chunks, una decisión escrita). El loader
 * resuelve los uuid por identidad y llama a esto.
 *
 * Re-cargar la misma arista no debe duplicarla. No hay UNIQUE en el esquema
 * (no se toca aquí): el DELETE previo borra la pareja (afectante, afectada,
 * tipo, artículo) antes del INSERT.
 */

import type { AfectacionCandidata } from "../collectors/src/senado/cerrar-leads.ts";

export interface DestinoAfectacion {
  readonly afectanteId: string;
  readonly afectadaId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lit(v: string | null): string {
  if (v === null) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

export function generarSqlAfectaciones(
  candidatas: readonly AfectacionCandidata[],
  ids: readonly DestinoAfectacion[],
): string[] {
  if (candidatas.length !== ids.length) {
    throw new Error(`candidatas (${candidatas.length}) y destinos (${ids.length}) no cuadran`);
  }
  const out: string[] = [];
  for (const [i, c] of candidatas.entries()) {
    const d = ids[i];
    if (!d) throw new Error(`falta destino para la candidata ${i}`);
    if (!UUID.test(d.afectanteId) || !UUID.test(d.afectadaId)) {
      throw new Error(`uuid inválido en destino ${i}`);
    }
    if (d.afectanteId === d.afectadaId) {
      throw new Error("afectacion_no_reflexiva: afectante y afectada son la misma fila");
    }
    const articuloSql = lit(c.articulo);
    const fechaSql = c.fechaEfecto === null ? "NULL" : lit(c.fechaEfecto);
    out.push(
      "delete from afectacion\n" +
        ` where norma_afectante_id = '${d.afectanteId}'\n` +
        `   and norma_afectada_id  = '${d.afectadaId}'\n` +
        `   and tipo = '${c.tipo}'\n` +
        `   and coalesce(articulo, '') = coalesce(${articuloSql}, '');`,
    );
    out.push(
      "insert into afectacion (\n" +
        "  norma_afectante_id, norma_afectada_id, tipo, articulo,\n" +
        "  fecha_efecto, fecha_derivation, fecha_regla, texto_soporte, derivation,\n" +
        "  url_fuente, captured_at, tier, diario_oficial)\n" +
        "values (\n" +
        `  '${d.afectanteId}', '${d.afectadaId}', '${c.tipo}', ${articuloSql},\n` +
        `  ${fechaSql}::date, '${c.fechaDerivation}', ${lit(c.fechaRegla)},\n` +
        `  ${lit(c.textoSoporte)}, '${c.derivation}',\n` +
        `  ${lit(c.urlFuente)}, ${lit(c.capturedAt)}::timestamptz, '${c.tier}',\n` +
        `  ${lit(c.diarioOficial)});`,
    );
  }
  return out;
}
