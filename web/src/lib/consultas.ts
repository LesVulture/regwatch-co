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

/**
 * Tablas del corpus que el producto puede leer por PostgREST cuando un RPC
 * no está en el schema cache. No es un atajo genérico: `captura` no entra.
 *
 * Medido 2026-08-22 contra la instancia viva: `ficha_proyecto` /
 * `listar_proyectos` / `ficha_providencia` devuelven PGRST202; `GET
 * /rest/v1/proyecto_ley?id=eq.…` y `GET /rest/v1/providencia` responden 200
 * con RLS de lectura pública. `db:drift` revierte y no despliega.
 */
export type TablaConsulta = "proyecto_ley" | "providencia";

/** Lo mínimo que esta capa necesita de un cliente de base de datos. */
export interface Consultante {
  rpc(nombre: string, args: Record<string, unknown>): Promise<{ filas: unknown[] }>;
  /**
   * Lectura de tabla PostgREST. El doble de tests no la implementa: si el RPC
   * existe, no se llama. Si el RPC falta (PGRST202) y esto no está, el error
   * original se propaga — no se finge un vacío.
   */
  filasTabla?(
    tabla: TablaConsulta,
    params: Readonly<Record<string, string>>,
  ): Promise<{ filas: unknown[] }>;
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
  // Ficha de proyecto / providencia (campos que YA están en el esquema).
  legislatura: "hecho_metadato",
  cuatrenio: "hecho_metadato",
  autor: "hecho_metadato",
  comision: "hecho_metadato",
  estado_camara: "hecho_metadato",
  estado_original: "hecho_metadato",
  numero_senado_canonico: "hecho_metadato",
  numero_camara_raw: "hecho_metadato",
  crosswalk: "hecho_metadato",
  crosswalk_motivo: "hecho_metadato",
  sentencia: "hecho_metadato",
  expediente: "hecho_metadato",
  magistrados: "hecho_metadato",
  fecha_publicacion: "hecho_metadato",
  fecha_sentencia: "hecho_metadato",
  url_texto: "hecho_metadato",
  tipo: "hecho_metadato",
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
  /**
   * `true` si estas filas salieron de la consulta ENSANCHADA (ver `ensanchar`).
   *
   * Se devuelve como campo y no solo dentro de `advertencia` porque quien
   * consume esto por API o por MCP no lee prosa: un resultado obtenido con
   * criterio más laxo que el pedido tiene que poder distinguirse en código.
   */
  readonly ensanchada: boolean;
  /**
   * `true` si había al menos una fila más allá del `limite` pedido. No es un
   * total: el producto no publica conteos. Solo dice si vale pedir la página
   * siguiente.
   */
  readonly hay_mas: boolean;
}

/**
 * El presupuesto de entidades del Q&A. Es el mismo `default` que declara
 * `contexto_qa` en SQL, repetido aquí porque la UNIÓN estricto+ensanchado se
 * recorta en TypeScript y necesita saber contra qué. Si cambia en el esquema,
 * cambia aquí: `consultas.test.ts` lo fija.
 */
export const MAX_ENTIDADES_QA = 5;

/**
 * Recorta a `max` ENTIDADES distintas conservando el orden de llegada, y con
 * ellas todos sus chunks. Recortar por filas partiría una entidad por la mitad
 * y dejaría un articulado a medias que se leería como el articulado entero.
 *
 * **Las entidades CON texto y los HUECOS llevan cuentas separadas, y esa es la
 * pieza que hace útil el recorte en vez de contraproducente.** El presupuesto
 * existe para acotar el tamaño del prompt, y lo que lo engorda son los chunks:
 * una entidad con articulado aporta hasta `max_chunks_por_entidad` fragmentos,
 * mientras que un hueco aporta UNA línea —«esta norma casó y su texto no está
 * capturado»—. Con una sola cuenta, las cinco primeras entidades con texto se
 * comían el cupo entero y los huecos —que llegan al final, porque son lo que
 * aporta el ensanchado— desaparecían del contexto: medido, el gold set pasó de
 * 3 huecos por pregunta a 0. Es decir, el recorte borraba justo aquello para lo
 * que se construyó la unión, y la respuesta volvía a decir «no consta» sin
 * mencionar lo que sí consta a medias.
 */
function recortarEntidades<T>(filas: readonly T[], max: number): T[] {
  const conTexto = new Set<string>();
  const huecos = new Set<string>();
  const out: T[] = [];
  for (const f of filas) {
    const fila = f as { entidad_id?: unknown; chunk_id?: unknown };
    const id = String(fila.entidad_id);
    // `== null` y no `=== null`: una fila cuyo `chunk_id` venga AUSENTE —no
    // nulo— es un hueco igual, y tratarla como entidad con texto le haría
    // gastar cupo de chunks a algo que no aporta ninguno.
    const vistas = fila.chunk_id == null ? huecos : conTexto;
    if (!vistas.has(id)) {
      if (vistas.size >= max) continue;
      vistas.add(id);
    }
    out.push(f);
  }
  return out;
}

/**
 * Los términos de la consulta en OR, para reintentar cuando el AND no da nada.
 *
 * `websearch_to_tsquery` hace AND de todo, que es correcto para «salud mental»
 * y ruinoso para una pregunta entera: «¿cuántos proyectos de ley sobre
 * inteligencia artificial hay en el Senado?» exige que un solo título contenga
 * los cinco términos y no lo cumple ninguno de los 1.694 — con 13 proyectos que
 * llevan «INTELIGENCIA ARTIFICIAL» en el título. Medido el 2026-08-20: cero
 * filas.
 *
 * **El ensanchado nunca SUSTITUYE al estricto: se UNE detrás de él.** La versión
 * anterior de esta documentación decía que solo se usaba «cuando el estricto
 * devolvió CERO», y ni eso era ya cierto —`buscar()` reintenta también cuando
 * ninguna fila la encontró el léxico— ni bastaba: el reintento usa otra tsquery
 * y por tanto otro ranking RRF, así que devolver sus filas a secas BORRABA las
 * que solo había encontrado el vector. Estricto primero, ensanchado detrás,
 * deduplicado y recortado al límite pedido.
 *
 * Y se declara — un buscador que ensancha en silencio le enseña al usuario
 * resultados que no pidió y le deja creer que sí. Solo se declara si algo del
 * ensanchado sobrevivió: anunciar un aporte que se acaba de recortar es avisar
 * de algo que el lector no tiene delante.
 *
 * Devuelve `null` cuando no hay nada que ensanchar (un solo término útil): en
 * ese caso el OR sería idéntico al AND y reintentar sería gastar una consulta.
 */
export function ensanchar(consulta: string): string | null {
  const terminos = [
    ...new Set(
      consulta
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 3 && !ARMAZON_JURIDICO.has(t)),
    ),
  ].slice(0, 12);
  if (terminos.length < 2) return null;
  // `OR` en mayúscula: es el operador que `websearch_to_tsquery` entiende.
  return terminos.join(" OR ");
}

/**
 * Palabras que forman el ARMAZÓN de una pregunta jurídica, no su asunto.
 *
 * Solo se descartan **al ensanchar**. En la consulta estricta no se toca nada:
 * quien busca «ley 2277 de 2022» quiere exactamente eso.
 *
 * No es una lista de intuición, y por eso lleva las cifras al lado. Frecuencia
 * documental medida en el corpus el 2026-08-20 (proyectos / providencias):
 *
 *   ley 418/366 · nacional 217/355 · norma 27/259 · articulo 125/105
 *   colombia 178/76 · congreso 54/19 · proyecto 16/81 · cuantos 4/177
 *
 * Frente a los términos que sí son el asunto: `inteligencia` 16/5,
 * `artificial` 15/2. Un OR que incluya `ley` hunde a los segundos debajo de
 * cientos de coincidencias con el primero — que es exactamente lo que pasaba:
 * la pregunta por los proyectos de IA devolvía providencias de temas ajenos que
 * casaban «ley» y «nacional».
 *
 * `salud` NO está en la lista pese a aparecer en 1.329 providencias. La línea
 * no es la frecuencia: es si la palabra describe la FORMA de la pregunta o su
 * CONTENIDO. «Salud» es contenido.
 */
const ARMAZON_JURIDICO = new Set([
  "ley",
  "leyes",
  "proyecto",
  "proyectos",
  "norma",
  "normas",
  "normativa",
  "articulo",
  "articulos",
  "senado",
  "camara",
  "congreso",
  "colombia",
  "colombiana",
  "colombiano",
  "nacional",
  "cuantos",
  "cuantas",
  "cual",
  "cuales",
  "existe",
  "existen",
  "vigente",
  "vigentes",
]);

/**
 * Busca y filtra por egreso.
 *
 * `contexto` es obligatorio porque la legalidad de un campo depende de él: el
 * mismo dato puede salir en una ficha y no en un dump.
 */
export interface OpcionesBusqueda {
  /**
   * Vector de la consulta, 256 dims re-normalizadas (`embeddings.ts`).
   * `null` cuando no hay Ollama al alcance — y entonces `hybrid_search`
   * devuelve exactamente lo que devolvía `busqueda_lexica`. Quien llama tiene
   * que DECIRLO: sin la mitad semántica no cambia el orden, cambia qué
   * resultados existen.
   */
  readonly embedding?: readonly number[] | null;
  /** Sesgo a léxico: sube para `"ley 2277 de 2022"`. */
  readonly pesoLexico?: number;
  /** Sesgo a semántico: sube para `"impuesto a bebidas azucaradas"`. */
  readonly pesoSemantico?: number;
  /** Recorte a un origen. Ya existía en SQL (`solo_tipo`); la capa no lo pasaba. */
  readonly soloTipo?: "proyecto_ley" | "providencia" | "norma";
  readonly legislatura?: string;
  readonly estado?: string;
  /** Cámara del trámite según el Senado, no el corpus de la Cámara. */
  readonly camara?: string;
  readonly anio?: number;
  readonly tipoProvidencia?: string;
  readonly comision?: string;
  readonly desplazamiento?: number;
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
    return {
      filas: [],
      omitidos: [],
      advertencia: "consulta vacía",
      ensanchada: false,
      hay_mas: false,
    };
  }

  // Se llama SIEMPRE a `hybrid_search`, también sin vector. Mantener aquí la
  // llamada a `busqueda_lexica` «hasta que haya embeddings» dejaría el camino
  // de producción distinto del camino probado. Sigue valiendo con embeddings
  // locales: `embeberConsulta` devuelve `null` si Ollama no está, y entonces
  // esta misma llamada degrada a la mitad léxica sin cambiar de código.
  //
  // `limite + 1`: la fila de más no se publica; solo dice si hay página
  // siguiente. Un total sería otra afirmación, y el producto no publica conteos.
  const pedido = limite + 1;
  const args = (consultaSql: string) => ({
    consulta: consultaSql,
    consulta_embedding: opciones.embedding ? `[${opciones.embedding.join(",")}]` : null,
    limite: pedido,
    ...argsFiltro(opciones),
    ...(opciones.pesoLexico !== undefined ? { peso_lexico: opciones.pesoLexico } : {}),
    ...(opciones.pesoSemantico !== undefined ? { peso_semantico: opciones.pesoSemantico } : {}),
  });

  const primero = await hybridSearch(db, args(texto));
  const filas = primero.filas;
  const avisoFirma = avisoFiltrosFueraDeFirma(primero.filtrosNoAplicados);

  // LA SEÑAL NO ES «cero filas», y confundirlas deja el fallo escondido.
  //
  // Con vector, `hybrid_search` casi siempre devuelve ALGO —lo que encontró la
  // mitad semántica— aunque la mitad léxica no haya casado nada. El resultado
  // no está vacío y aun así falta todo lo que solo el texto podía encontrar:
  // buscar «inteligencia artificial en salud» devolvía la Ley 1616 y NINGUNO de
  // los 13 proyectos con «INTELIGENCIA ARTIFICIAL» en el título, porque ningún
  // título tiene además «salud». `posicion_lexica` en NULL en todas las filas
  // es esa señal, exacta y ya devuelta por la función.
  const sinLexico =
    filas.length === 0 ||
    filas.every((f) => (f as { posicion_lexica?: unknown }).posicion_lexica == null);
  if (!sinLexico) {
    return conAvisoFirma(aplicarEgreso(filas, contexto, texto, false, limite), avisoFirma);
  }

  const laxa = ensanchar(texto);
  if (laxa === null) {
    return conAvisoFirma(aplicarEgreso(filas, contexto, texto, false, limite), avisoFirma);
  }

  const reintento = await hybridSearch(db, args(laxa));
  if (reintento.filas.length === 0) {
    return conAvisoFirma(aplicarEgreso(filas, contexto, texto, false, limite), avisoFirma);
  }

  // UNIÓN, no sustitución — y la diferencia es que la versión anterior sí podía
  // quitar resultados pese al comentario que juraba lo contrario. El reintento
  // usa otra tsquery y por tanto otro ranking RRF: las filas que solo encontró
  // el vector pueden no volver a salir, y devolver `reintento.filas` a secas las
  // borraba. Estricto primero —conserva el orden de precisión— y detrás lo que
  // el ensanchado añade de nuevo, recortado al mismo `limite` que se pidió.
  const yaVistas = new Set(filas.map((f) => String((f as { id?: unknown }).id)));
  const nuevas = reintento.filas.filter((f) => !yaVistas.has(String((f as { id?: unknown }).id)));
  const union = [...filas, ...nuevas];
  const idsNuevas = new Set(nuevas.map((f) => String((f as { id?: unknown }).id)));
  const recortadas = union.slice(0, limite);
  const aportaNuevas = recortadas.some((f) => idsNuevas.has(String((f as { id?: unknown }).id)));
  return conAvisoFirma(aplicarEgreso(union, contexto, texto, aportaNuevas, limite), avisoFirma);
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

  const args = (consultaSql: string) => ({
    consulta: consultaSql,
    consulta_embedding: opciones.embedding ? `[${opciones.embedding.join(",")}]` : null,
    ...(opciones.maxEntidades !== undefined ? { max_entidades: opciones.maxEntidades } : {}),
    ...(opciones.maxChunksPorEntidad !== undefined
      ? { max_chunks_por_entidad: opciones.maxChunksPorEntidad }
      : {}),
    ...(opciones.pesoLexico !== undefined ? { peso_lexico: opciones.pesoLexico } : {}),
    ...(opciones.pesoSemantico !== undefined ? { peso_semantico: opciones.pesoSemantico } : {}),
  });

  // Aquí el ensanchado NO es un reintento, es una UNIÓN — y la diferencia es la
  // que hace que el Q&A sirva para algo.
  //
  // La entrada de esta función es siempre una PREGUNTA, no dos palabras clave,
  // así que el AND de `websearch_to_tsquery` casi nunca casa y `contexto_qa`
  // devuelve solo lo que encontró el vector: los chunks que existen. Las
  // entidades que casan por texto y NO tienen articulado capturado —el HUECO
  // que esta función existe para devolver— no llegaban nunca, y la respuesta
  // salía diciendo «no consta» sin mencionar lo que sí consta a medias.
  //
  // Estricto primero y ensanchado después, deduplicado por entidad: el orden de
  // precisión se conserva y la cola trae recobro.
  const primera = await db.rpc("contexto_qa", args(texto));
  let filas = primera.filas;
  let ensanchada = false;

  const laxa = ensanchar(texto);
  if (laxa !== null) {
    const extra = await db.rpc("contexto_qa", args(laxa));
    const yaVistas = new Set(filas.map((f) => String((f as { entidad_id?: unknown }).entidad_id)));
    const nuevas = extra.filas.filter(
      (f) => !yaVistas.has(String((f as { entidad_id?: unknown }).entidad_id)),
    );
    if (nuevas.length > 0) {
      // La unión se RECORTA al mismo presupuesto de entidades que se pidió. Sin
      // esto, quien llama con `max_entidades: 5` recibe hasta 10 —cinco por
      // llamada— y el prompt del Q&A crece al doble a espaldas del llamador.
      // Estricto primero: el ensanchado solo ocupa los huecos que sobren.
      filas = recortarEntidades([...filas, ...nuevas], opciones.maxEntidades ?? MAX_ENTIDADES_QA);
      // Y se avisa solo si alguna entidad ensanchada SOBREVIVIÓ al recorte:
      // anunciar un ensanchado cuyo aporte se acaba de tirar sería avisar de
      // algo que el lector no tiene delante.
      ensanchada = filas.some(
        (f) => !yaVistas.has(String((f as { entidad_id?: unknown }).entidad_id)),
      );
    }
  }

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

  const ctx = agruparContexto(limpias);
  const avisoEnsanchado = ensanchada
    ? `Parte de este contexto sale de una búsqueda ENSANCHADA sobre «${texto}»: ` +
      "registros que contienen alguno de los términos, no todos."
    : null;
  return {
    ...ctx,
    // Las dos advertencias se CONCATENAN en vez de pisarse: «faltan textos por
    // capturar» y «los términos se ensancharon» son cosas distintas y las dos
    // cambian cómo hay que leer la respuesta.
    advertencia: [ctx.advertencia, avisoEnsanchado].filter(Boolean).join(" ") || null,
    omitidos: [...omitidos],
  };
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

  const r = aplicarEgreso(
    filas,
    contexto,
    `${norma.tipo} ${norma.numero} de ${norma.anio}`,
    // La vigencia no se ensancha NUNCA: se consulta por identidad de norma, no
    // por texto. Ensanchar aquí devolvería la vigencia de otra norma.
    false,
  );
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

function argsFiltro(o: OpcionesBusqueda): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  if (o.soloTipo !== undefined) a.solo_tipo = o.soloTipo;
  if (o.legislatura !== undefined) a.filtro_legislatura = o.legislatura;
  if (o.estado !== undefined) a.filtro_estado = o.estado;
  if (o.camara !== undefined) a.filtro_camara = o.camara;
  if (o.anio !== undefined) a.filtro_anio = o.anio;
  if (o.tipoProvidencia !== undefined) a.filtro_tipo_providencia = o.tipoProvidencia;
  if (o.desplazamiento !== undefined && o.desplazamiento > 0) {
    a.desplazamiento = o.desplazamiento;
  }
  return a;
}

/**
 * Parámetros que la instancia viva (firma de `hybrid_search` al 2026-08-22)
 * no tiene. Medido: `filtro_anio` → PGRST202 con hint
 * `hybrid_search(consulta, consulta_embedding, limite, peso_lexico,
 * peso_semantico, pool, rrf_k, solo_tipo)`. `solo_tipo` sí está.
 */
const FILTROS_FIRMA_NUEVA = [
  "filtro_legislatura",
  "filtro_estado",
  "filtro_camara",
  "filtro_anio",
  "filtro_tipo_providencia",
  "desplazamiento",
] as const;

const ETIQUETA_FILTRO_NUEVO: Record<(typeof FILTROS_FIRMA_NUEVA)[number], string> = {
  filtro_legislatura: "legislatura",
  filtro_estado: "estado",
  filtro_camara: "cámara",
  filtro_anio: "año",
  filtro_tipo_providencia: "tipo de providencia",
  desplazamiento: "página",
};

function recortarFiltrosNuevos(args: Record<string, unknown>): {
  recortado: Record<string, unknown>;
  ignorados: string[];
} {
  const recortado = { ...args };
  const ignorados: string[] = [];
  for (const k of FILTROS_FIRMA_NUEVA) {
    if (k in recortado) {
      delete recortado[k];
      ignorados.push(ETIQUETA_FILTRO_NUEVO[k]);
    }
  }
  return { recortado, ignorados };
}

function esPgrst202(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("PGRST202");
}

async function hybridSearch(
  db: Consultante,
  args: Record<string, unknown>,
): Promise<{ filas: unknown[]; filtrosNoAplicados: readonly string[] }> {
  try {
    const { filas } = await db.rpc("hybrid_search", args);
    return { filas, filtrosNoAplicados: [] };
  } catch (e) {
    if (!esPgrst202(e)) throw e;
    const { recortado, ignorados } = recortarFiltrosNuevos(args);
    if (ignorados.length === 0) throw e;
    const { filas } = await db.rpc("hybrid_search", recortado);
    return { filas, filtrosNoAplicados: ignorados };
  }
}

function avisoFiltrosFueraDeFirma(nombres: readonly string[]): string | null {
  if (nombres.length === 0) return null;
  return (
    `El recorte por ${nombres.join(", ")} no se aplicó: la búsqueda desplegada ` +
    "sigue siendo consulta + tipo, sin esos parámetros. No se filtró después " +
    "del límite."
  );
}

function conAvisoFirma(r: ResultadoBusqueda, extra: string | null): ResultadoBusqueda {
  if (extra === null) return r;
  return {
    ...r,
    advertencia: r.advertencia ? `${r.advertencia} ${extra}` : extra,
  };
}

async function rpcOTabla(
  db: Consultante,
  nombre: string,
  args: Record<string, unknown>,
  alternativa: (leer: NonNullable<Consultante["filasTabla"]>) => Promise<{ filas: unknown[] }>,
): Promise<{ filas: unknown[] }> {
  try {
    return await db.rpc(nombre, args);
  } catch (e) {
    if (!esPgrst202(e) || db.filasTabla === undefined) throw e;
    return alternativa(db.filasTabla);
  }
}

function citaPostgrest(v: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(v)) return v;
  return `"${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

const SELECT_FICHA_PROYECTO =
  "id,titulo,legislatura,cuatrenio,autor,comision,estado,estado_original,estado_camara,numero_senado_canonico,numero_camara_raw,crosswalk,crosswalk_motivo,url_fuente,captured_at,tier";

const SELECT_LISTAR_PROYECTO =
  "id,titulo,numero_senado_canonico,estado,legislatura,autor,comision,estado_camara,url_fuente,captured_at,tier";

const SELECT_FICHA_PROVIDENCIA =
  "id,tema,sentencia,tipo,fecha_publicacion,fecha_sentencia,expediente,magistrados,url_fuente,url_texto,captured_at,tier";

const SELECT_LISTAR_PROVIDENCIA =
  "id,tema,sentencia,tipo,fecha_publicacion,url_texto,captured_at,tier";

function proyectarFichaProyecto(f: Record<string, unknown>): Record<string, unknown> {
  return { ...f, referencia: f.numero_senado_canonico };
}

function proyectarListarProyecto(f: Record<string, unknown>): Record<string, unknown> {
  return {
    origen: "proyecto_ley",
    id: f.id,
    titulo: f.titulo,
    referencia: f.numero_senado_canonico,
    estado: f.estado,
    fecha: null,
    legislatura: f.legislatura,
    autor: f.autor,
    comision: f.comision,
    estado_camara: f.estado_camara,
    url_fuente: f.url_fuente,
    captured_at: f.captured_at,
    tier: f.tier,
  };
}

function tituloProvidencia(tema: unknown): string | null {
  if (typeof tema !== "string" || tema === "" || tema === "Sin información") return null;
  return tema;
}

function proyectarFichaProvidencia(f: Record<string, unknown>): Record<string, unknown> {
  return { ...f, titulo: tituloProvidencia(f.tema) };
}

function proyectarListarProvidencia(f: Record<string, unknown>): Record<string, unknown> {
  return {
    origen: "providencia",
    id: f.id,
    titulo: tituloProvidencia(f.tema),
    referencia: f.sentencia,
    estado: f.tipo,
    fecha: f.fecha_publicacion,
    url_fuente: f.url_texto,
    captured_at: f.captured_at,
    tier: f.tier,
  };
}

function paramsListarProyectos(o: OpcionesBusqueda, pedido: number): Record<string, string> {
  const p: Record<string, string> = {
    select: SELECT_LISTAR_PROYECTO,
    order: "captured_at.desc,id.asc",
    limit: String(pedido),
    offset: String(Math.max(o.desplazamiento ?? 0, 0)),
  };
  const and: string[] = [];
  if (o.legislatura !== undefined) and.push(`legislatura.eq.${citaPostgrest(o.legislatura)}`);
  if (o.estado !== undefined) and.push(`estado.eq.${citaPostgrest(o.estado)}`);
  if (o.camara !== undefined) and.push(`estado_camara.eq.${citaPostgrest(o.camara)}`);
  if (o.comision !== undefined) and.push(`comision.eq.${citaPostgrest(o.comision)}`);
  if (o.anio !== undefined) and.push(`legislatura.like.*${o.anio}*`);
  if (and.length > 0) p.and = `(${and.join(",")})`;
  return p;
}

function paramsListarProvidencias(o: OpcionesBusqueda, pedido: number): Record<string, string> {
  const p: Record<string, string> = {
    select: SELECT_LISTAR_PROVIDENCIA,
    order: "fecha_publicacion.desc.nullslast,id.asc",
    limit: String(pedido),
    offset: String(Math.max(o.desplazamiento ?? 0, 0)),
  };
  const and: string[] = [];
  if (o.tipoProvidencia !== undefined) and.push(`tipo.eq.${citaPostgrest(o.tipoProvidencia)}`);
  if (o.anio !== undefined) {
    and.push(`fecha_publicacion.gte.${o.anio}-01-01`);
    and.push(`fecha_publicacion.lt.${o.anio + 1}-01-01`);
  }
  if (and.length > 0) p.and = `(${and.join(",")})`;
  return p;
}

export async function listarProyectos(
  db: Consultante,
  contexto: ContextoEgreso,
  opciones: OpcionesBusqueda = {},
  limite = 20,
): Promise<ResultadoBusqueda> {
  const pedido = limite + 1;
  const { filas } = await rpcOTabla(
    db,
    "listar_proyectos",
    {
      limite: pedido,
      ...(opciones.legislatura !== undefined ? { filtro_legislatura: opciones.legislatura } : {}),
      ...(opciones.estado !== undefined ? { filtro_estado: opciones.estado } : {}),
      ...(opciones.camara !== undefined ? { filtro_camara: opciones.camara } : {}),
      ...(opciones.comision !== undefined ? { filtro_comision: opciones.comision } : {}),
      ...(opciones.anio !== undefined ? { filtro_anio: opciones.anio } : {}),
      ...(opciones.desplazamiento !== undefined && opciones.desplazamiento > 0
        ? { desplazamiento: opciones.desplazamiento }
        : {}),
    },
    (leer) => leer("proyecto_ley", paramsListarProyectos(opciones, pedido)),
  );
  const proyectadas = filas.map((f) =>
    esFilaListarProyecto(f) ? f : proyectarListarProyecto(f as Record<string, unknown>),
  );
  return aplicarEgreso(proyectadas, contexto, "el recorte de proyectos pedido", false, limite);
}

function esFilaListarProyecto(f: unknown): boolean {
  return (
    typeof f === "object" && f !== null && (f as { origen?: unknown }).origen === "proyecto_ley"
  );
}

export async function listarProvidencias(
  db: Consultante,
  contexto: ContextoEgreso,
  opciones: OpcionesBusqueda = {},
  limite = 20,
): Promise<ResultadoBusqueda> {
  const pedido = limite + 1;
  const { filas } = await rpcOTabla(
    db,
    "listar_providencias",
    {
      limite: pedido,
      ...(opciones.anio !== undefined ? { filtro_anio: opciones.anio } : {}),
      ...(opciones.tipoProvidencia !== undefined ? { filtro_tipo: opciones.tipoProvidencia } : {}),
      ...(opciones.desplazamiento !== undefined && opciones.desplazamiento > 0
        ? { desplazamiento: opciones.desplazamiento }
        : {}),
    },
    (leer) => leer("providencia", paramsListarProvidencias(opciones, pedido)),
  );
  const proyectadas = filas.map((f) =>
    esFilaListarProvidencia(f) ? f : proyectarListarProvidencia(f as Record<string, unknown>),
  );
  return aplicarEgreso(proyectadas, contexto, "el recorte de jurisprudencia pedido", false, limite);
}

function esFilaListarProvidencia(f: unknown): boolean {
  return (
    typeof f === "object" && f !== null && (f as { origen?: unknown }).origen === "providencia"
  );
}

export async function fichaProyecto(
  db: Consultante,
  id: string,
  contexto: ContextoEgreso,
): Promise<ResultadoBusqueda> {
  const { filas } = await rpcOTabla(db, "ficha_proyecto", { proyecto: id }, (leer) =>
    leer("proyecto_ley", {
      id: `eq.${id}`,
      select: SELECT_FICHA_PROYECTO,
      limit: "1",
    }),
  );
  const proyectadas = filas.map((f) => {
    const r = f as Record<string, unknown>;
    return r.referencia !== undefined ? r : proyectarFichaProyecto(r);
  });
  return aplicarEgreso(proyectadas, contexto, `proyecto ${id}`, false);
}

export async function fichaProvidencia(
  db: Consultante,
  id: string,
  contexto: ContextoEgreso,
): Promise<ResultadoBusqueda> {
  const { filas } = await rpcOTabla(db, "ficha_providencia", { prov: id }, (leer) =>
    leer("providencia", {
      id: `eq.${id}`,
      select: SELECT_FICHA_PROVIDENCIA,
      limit: "1",
    }),
  );
  const proyectadas = filas.map((f) => {
    const r = f as Record<string, unknown>;
    return Object.hasOwn(r, "titulo") ? r : proyectarFichaProvidencia(r);
  });
  return aplicarEgreso(proyectadas, contexto, `providencia ${id}`, false);
}

export async function opcionesFiltroProyectos(db: Consultante): Promise<{
  legislaturas: string[];
  estados: string[];
  camaras: string[];
  comisiones: string[];
}> {
  let filas: unknown[];
  try {
    ({ filas } = await db.rpc("opciones_filtro_proyectos", {}));
  } catch (e) {
    if (!esPgrst202(e)) throw e;
    return { legislaturas: [], estados: [], camaras: [], comisiones: [] };
  }
  const f = filas[0] as
    | {
        legislaturas?: unknown;
        estados?: unknown;
        camaras?: unknown;
        comisiones?: unknown;
      }
    | undefined;
  return {
    legislaturas: textos(f?.legislaturas),
    estados: textos(f?.estados),
    camaras: textos(f?.camaras),
    comisiones: textos(f?.comisiones),
  };
}

export async function opcionesFiltroProvidencias(
  db: Consultante,
): Promise<{ anios: number[]; tipos: string[] }> {
  let filas: unknown[];
  try {
    ({ filas } = await db.rpc("opciones_filtro_providencias", {}));
  } catch (e) {
    if (!esPgrst202(e)) throw e;
    return { anios: [], tipos: [] };
  }
  const f = filas[0] as { anios?: unknown; tipos?: unknown } | undefined;
  return { anios: enteros(f?.anios), tipos: textos(f?.tipos) };
}

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function enteros(v: unknown): number[] {
  return Array.isArray(v)
    ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x))
    : [];
}

function aplicarEgreso(
  filas: readonly unknown[],
  contexto: ContextoEgreso,
  consulta: string,
  ensanchada: boolean,
  limite: number | null = null,
): ResultadoBusqueda {
  const hayMas = limite !== null && filas.length > limite;
  const visibles = hayMas ? filas.slice(0, limite) : filas;
  const salida: Record<string, unknown>[] = [];
  const omitidos = new Set<string>();

  for (const f of visibles) {
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
    ensanchada,
    hay_mas: hayMas,
    advertencia:
      salida.length === 0
        ? `Sin resultados para «${consulta}». Eso significa que no aparece en lo ` +
          "capturado, no que no exista."
        : ensanchada
          ? `Ningún registro contiene TODOS los términos de «${consulta}». Estos ` +
            "resultados salen de una búsqueda ensanchada: contienen alguno de " +
            "ellos, no todos."
          : null,
  };
}

/**
 * Identidad de una norma a partir de una fila de búsqueda.
 *
 * `hybrid_search` ya devuelve `referencia` = `{tipo} {numero} de {anio}`
 * (medido en 08_rag.sql). No se añaden columnas nuevas: parsear lo que ya
 * sale por la lista blanca evita filtrar un campo sin procedencia.
 */
export function identidadNorma(
  origen: unknown,
  referencia: unknown,
): { tipo: string; numero: string; anio: number } | null {
  if (origen !== "norma" || typeof referencia !== "string") return null;
  const m = /^(.+?)\s+(\S+)\s+de\s+(\d{4})$/.exec(referencia.trim());
  if (!m) return null;
  return { tipo: m[1] as string, numero: m[2] as string, anio: Number(m[3]) };
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
