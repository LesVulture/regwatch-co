/**
 * Capa de consulta del producto.
 *
 * Es la frontera entre la base y cualquier cosa que se muestre: página, API,
 * dump o MCP. **Todo sale por aquí, y aquí se aplica la política de egreso.**
 *
 * Que sea un módulo y no «que cada endpoint se acuerde» es la decisión: al
 * añadir el endpoint número catorce nadie se acuerda, y el fallo de ese olvido
 * no es una excepción — es un dato publicado que no debía salir.
 *
 * La conexión se inyecta. No es comodidad de test: permite escribir y validar
 * esta capa antes de que exista la instancia, y obliga a que la política sea
 * comprobable sin base de datos.
 */

import {
  type ContextoEgreso,
  filtrarRegistro,
  type Procedencia,
} from "../../../collectors/src/egreso/politica.ts";
import {
  agruparContexto,
  type Contexto,
  type FilaContexto,
  type OpcionesContexto,
} from "../../../collectors/src/rag/contexto.ts";

/** Lo mínimo que esta capa necesita de un cliente de base de datos. */
export interface Consultante {
  rpc(nombre: string, args: Record<string, unknown>): Promise<{ filas: unknown[] }>;
}

/**
 * Procedencia de cada campo que el producto puede mostrar.
 *
 * Es la LISTA BLANCA: un campo que no esté aquí no sale, aunque la consulta lo
 * devuelva. Añadir una columna a una tabla no la publica; publicarla es añadir
 * una línea aquí, que es una decisión visible en el diff.
 */
export const PROCEDENCIA_CAMPOS: Readonly<Record<string, Procedencia>> = {
  // Búsqueda
  origen: "hecho_metadato",
  id: "hecho_metadato",
  titulo: "hecho_metadato",
  referencia: "hecho_metadato",
  estado: "hecho_metadato",
  fecha: "hecho_metadato",
  rank: "hecho_metadato",
  posicion: "hecho_metadato",
  // Metadatos de ranking de `hybrid_search`. Van en la lista blanca a
  // propósito: enseñar POR QUÉ una fila salió primera es parte de que el
  // sistema sea auditable, y `posicion_semantica: null` dice, sin prosa, que
  // esa fila la encontró el texto y no el vector.
  score: "hecho_metadato",
  posicion_lexica: "hecho_metadato",
  posicion_semantica: "hecho_metadato",
  // Contexto del Q&A (`contexto_qa`). `texto` es el ARTICULADO: sale como
  // texto normativo oficial, con las condiciones del art. 41 —igual que
  // `clausula_prueba`— y no como un metadato cualquiera.
  posicion_entidad: "hecho_metadato",
  entidad_id: "hecho_metadato",
  entidad: "hecho_metadato",
  chunk_id: "hecho_metadato",
  caracteres: "hecho_metadato",
  texto: "normativo_oficial",
  url_fuente: "hecho_metadato",
  captured_at: "hecho_metadato",
  tier: "hecho_metadato",
  // Vigencia
  veredicto: "hecho_metadato",
  articulo: "hecho_metadato",
  tipo_afectacion: "hecho_metadato",
  fecha_efecto: "hecho_metadato",
  ya_surtio_efecto: "hecho_metadato",
  norma_afectante: "hecho_metadato",
  diario_oficial: "hecho_metadato",
  regla_aplicada: "hecho_metadato",
  procedencia: "hecho_metadato",
  verificable_en: "hecho_metadato",
  // La cláusula es texto normativo oficial: sale, condicionada.
  clausula_prueba: "normativo_oficial",
};

export interface ResultadoBusqueda {
  readonly filas: readonly Record<string, unknown>[];
  /** Campos que la política dejó fuera. Se reporta: un filtro mudo no es auditable. */
  readonly omitidos: readonly string[];
  /** Vacío NO significa «no existe». Lo dice aquí para que quien llame lo diga. */
  readonly advertencia: string | null;
}

/**
 * Busca y filtra por egreso.
 *
 * `contexto` es obligatorio porque la legalidad de un campo depende de él: el
 * mismo dato puede salir en una ficha y no en un dump.
 */
export interface OpcionesBusqueda {
  /**
   * Vector de la consulta, 256 dims re-normalizadas (`embeddings.ts`).
   * `null` mientras no haya clave de Voyage — y entonces `hybrid_search`
   * devuelve exactamente lo que devolvía `busqueda_lexica`.
   */
  readonly embedding?: readonly number[] | null;
  /** Sesgo a léxico: sube para `"ley 2277 de 2022"`. */
  readonly pesoLexico?: number;
  /** Sesgo a semántico: sube para `"impuesto a bebidas azucaradas"`. */
  readonly pesoSemantico?: number;
}

export async function buscar(
  db: Consultante,
  consulta: string,
  contexto: ContextoEgreso,
  limite = 20,
  opciones: OpcionesBusqueda = {},
): Promise<ResultadoBusqueda> {
  const texto = consulta.trim();
  if (texto === "") {
    return { filas: [], omitidos: [], advertencia: "consulta vacía" };
  }

  // Se llama SIEMPRE a `hybrid_search`, también sin vector. Mantener aquí la
  // llamada a `busqueda_lexica` «hasta que haya embeddings» dejaría el camino
  // de producción distinto del camino probado, y el día que llegara la clave
  // se estrenarían las dos cosas a la vez.
  const { filas } = await db.rpc("hybrid_search", {
    consulta: texto,
    consulta_embedding: opciones.embedding ? `[${opciones.embedding.join(",")}]` : null,
    limite,
    ...(opciones.pesoLexico !== undefined ? { peso_lexico: opciones.pesoLexico } : {}),
    ...(opciones.pesoSemantico !== undefined ? { peso_semantico: opciones.pesoSemantico } : {}),
  });
  return aplicarEgreso(filas, contexto, texto);
}

/**
 * Contexto citable para el Q&A, filtrado por la MISMA política.
 *
 * Existe porque al escribir `recuperarContexto()` construí la puerta de egreso
 * número catorce y no me acordé de esta frontera — que es, literalmente, el
 * fallo que el comentario de cabecera de este módulo predice. El Q&A devuelve
 * el articulado completo: si sale por otro sitio, la lista blanca deja de ser
 * una lista blanca.
 *
 * Hoy no cambia ningún resultado (`normativo_oficial` y `hecho_metadato` salen
 * en los cuatro contextos), y ese es justo el motivo de ponerlo ahora: lo que
 * esto ataja es el campo que alguien añada MAÑANA a `chunk`.
 */
export async function contextoQa(
  db: Consultante,
  consulta: string,
  contexto: ContextoEgreso,
  opciones: OpcionesContexto = {},
): Promise<Contexto & { readonly omitidos: readonly string[] }> {
  const texto = consulta.trim();
  if (texto === "") {
    return { chunks: [], huecos: [], redactados: [], advertencia: "consulta vacía", omitidos: [] };
  }

  const { filas } = await db.rpc("contexto_qa", {
    consulta: texto,
    consulta_embedding: opciones.embedding ? `[${opciones.embedding.join(",")}]` : null,
    ...(opciones.maxEntidades !== undefined ? { max_entidades: opciones.maxEntidades } : {}),
    ...(opciones.maxChunksPorEntidad !== undefined
      ? { max_chunks_por_entidad: opciones.maxChunksPorEntidad }
      : {}),
    ...(opciones.pesoLexico !== undefined ? { peso_lexico: opciones.pesoLexico } : {}),
    ...(opciones.pesoSemantico !== undefined ? { peso_semantico: opciones.pesoSemantico } : {}),
  });

  const omitidos = new Set<string>();
  const limpias = filas.map((f) => {
    const { datos, omitidos: om } = filtrarRegistro(
      f as Record<string, unknown>,
      PROCEDENCIA_CAMPOS,
      contexto,
    );
    for (const o of om) omitidos.add(o);
    return datos as unknown as FilaContexto;
  });

  return { ...agruparContexto(limpias), omitidos: [...omitidos] };
}

/** Vigencia a fecha arbitraria, filtrada igual. */
export async function vigencia(
  db: Consultante,
  norma: { tipo: string; numero: string; anio: number },
  contexto: ContextoEgreso,
  aFecha?: string,
): Promise<ResultadoBusqueda> {
  const { filas } = await db.rpc("consultar_vigencia", {
    norma_tipo: norma.tipo,
    norma_numero: norma.numero,
    norma_anio: norma.anio,
    ...(aFecha ? { a_fecha: aFecha } : {}),
  });

  const r = aplicarEgreso(filas, contexto, `${norma.tipo} ${norma.numero} de ${norma.anio}`);
  if (r.filas.length === 0) {
    return {
      ...r,
      // La frase importa tanto como el dato. «Cero afectaciones» y «vigente
      // para siempre» son cosas distintas, y confundirlas es el error que este
      // proyecto existe para no cometer.
      advertencia:
        "No consta ninguna afectación de esta norma en el corpus. Eso NO significa " +
        "que esté vigente sin cambios: significa que no se ha capturado ninguna.",
    };
  }
  return r;
}

function aplicarEgreso(
  filas: readonly unknown[],
  contexto: ContextoEgreso,
  consulta: string,
): ResultadoBusqueda {
  const salida: Record<string, unknown>[] = [];
  const omitidos = new Set<string>();

  for (const f of filas) {
    const { datos, omitidos: om } = filtrarRegistro(
      f as Record<string, unknown>,
      PROCEDENCIA_CAMPOS,
      contexto,
    );
    for (const o of om) omitidos.add(o);
    salida.push(datos);
  }

  return {
    filas: salida,
    omitidos: [...omitidos],
    advertencia:
      salida.length === 0
        ? `Sin resultados para «${consulta}». Eso significa que no aparece en lo ` +
          "capturado, no que no exista."
        : null,
  };
}

/**
 * ¿Toda fila lleva su procedencia?
 *
 * Se comprueba en la frontera, no se confía. Una fila sin `url_fuente` o sin
 * `captured_at` no se puede publicar: sería una afirmación sin respaldo, que es
 * exactamente lo que el contrato de evidencia prohíbe.
 */
export function verificarProcedencia(filas: readonly Record<string, unknown>[]): string[] {
  const fallos: string[] = [];
  for (const [i, f] of filas.entries()) {
    const url = f.url_fuente ?? f.verificable_en;
    if (typeof url !== "string" || url === "") fallos.push(`fila ${i}: sin url de fuente`);
    // `consultar_vigencia` no devuelve captured_at; la comprobación se acota a
    // las filas que sí lo traen, en vez de exigirlo donde no aplica.
    if ("captured_at" in f && !f.captured_at) fallos.push(`fila ${i}: captured_at vacío`);
  }
  return fallos;
}
