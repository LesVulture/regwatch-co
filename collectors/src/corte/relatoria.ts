/**
 * Corte Constitucional — relatoría.
 *
 * La superficie de datos es mucho mejor de lo que aparenta: detrás del buscador
 * hay un **Elasticsearch** que devuelve el índice completo de un año en UNA
 * llamada. 1.141 providencias de 2026 en 2,3 MB, medido el 2026-08-20.
 *
 * ## Lo que hay que saber o el colector falla en silencio
 *
 * 1. **El JSON llega con `Content-Type: text/html`.** No es un descuido de la
 *    fuente que se pueda ignorar: un gate que exija `application/json` bloquea
 *    el 100 % de las respuestas VÁLIDAS, y eso no se nota — parece que la
 *    fuente está caída. (Estaba mal declarado en `sources.ts` hasta hoy.)
 *
 * 2. **`maxprov` tiene techo, y pasarse NO da error.** Con 10001 responde
 *    `HTTP 200` y 2.882 bytes de fragmento HTML con una alerta dentro. Un
 *    ingestor que mire el status registra cero providencias y sigue tan
 *    tranquilo.
 *
 * 3. **La respuesta de Elasticsearch va ENVUELTA.** La raíz es
 *    `{data, parametros}`; el índice vive en `data.hits.hits[]._source`. La
 *    investigación decía «respuesta ES cruda», que está a un nivel de
 *    distancia — suficiente para que un parser escrito de oído devuelva vacío.
 *
 * 4. **Se cuenta `hits.hits`, no los campos de conteo.** `hits.total.value`
 *    sirve para CONTRASTAR, nunca como la cifra buena.
 */

export const BASE = "https://www.corteconstitucional.gov.co/relatoria";
export const BUSCADOR = `${BASE}/buscador_new/`;
export const SOURCE_KEY = "corte-relatoria";

/**
 * Techo seguro de `maxprov`. 2.000 está medido; 10.001 devuelve el fragmento de
 * error. El margen es deliberado: acercarse al límite exacto de una fuente que
 * falla en silencio no compensa.
 */
export const MAXPROV = 2_000;

/** Los 4 tipos de providencia medidos. */
export const TIPOS_PROVIDENCIA = [
  "Auto",
  "Tutela",
  "Constitucionalidad",
  "Sentencia de unificación",
] as const;

/** Registro tal como lo publica el índice. */
export interface ProvidenciaRaw {
  readonly prov_id: number;
  readonly prov_sentencia: string;
  readonly prov_tipo: string;
  readonly prov_f_public: string;
  readonly prov_f_sentencia: string;
  readonly prov_expediente: string;
  readonly prov_magistrados: readonly string[];
  readonly prov_proceso_terminos: string;
  readonly prov_sintesis: string;
  readonly prov_tema: string;
  /** Ruta relativa del texto completo. Se GUARDA, no se deriva. */
  readonly rutahtml: string;
  readonly sala_seguimiento: string;
}

export interface Providencia {
  readonly id: number;
  readonly sentencia: string;
  readonly tipo: string;
  /** `true` si el tipo no es uno de los 4 medidos. No se descarta: se marca. */
  readonly tipoDesconocido: boolean;
  readonly fechaPublicacion: string | null;
  readonly fechaSentencia: string | null;
  readonly expediente: string;
  readonly magistrados: readonly string[];
  readonly tema: string;
  /** URL absoluta del texto completo, resuelta desde `rutahtml`. */
  readonly urlTexto: string | null;
  readonly raw: ProvidenciaRaw;
}

export interface Anomalia {
  readonly clase:
    | "envelope-inesperado"
    | "total-no-cuadra"
    | "tipo-desconocido"
    | "sin-rutahtml"
    | "id-duplicado"
    | "fecha-ilegible";
  readonly detalle: string;
}

export interface ResultadoRelatoria {
  readonly providencias: readonly Providencia[];
  readonly anomalias: readonly Anomalia[];
  /** Lo que el índice DICE que hay. Contraste, nunca la cifra buena. */
  readonly totalDeclarado: number | null;
}

/** `YYYY-MM-DD` o nada. No se normaliza a la fuerza lo que no viene así. */
function fechaIso(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Resuelve la URL del texto completo.
 *
 * Regla verificada en cuatro formas de identificador distintas. `rutahtml` se
 * toma TAL CUAL del índice y se guarda como columna: derivarlo de
 * `prov_sentencia` parecería más limpio y sería inventar — `A. 1126/26` no se
 * convierte en `Autos/2026/A1126-26.htm` por ninguna regla que la fuente
 * garantice.
 */
export function urlTexto(rutahtml: unknown): string | null {
  if (typeof rutahtml !== "string" || rutahtml.trim() === "") return null;
  return `${BASE}/${rutahtml.replace(/^\/+/, "")}`;
}

/** Una ventana de fechas cerrada, en ISO. */
export interface Ventana {
  readonly fini: string;
  readonly ffin: string;
}

/** La consulta de una ventana. Sin red: solo la petición. */
export function peticionVentana(v: Ventana) {
  const q = new URLSearchParams({
    accion: "search",
    fuente: "publicacion",
    fini: v.fini,
    ffin: v.ffin,
    buscar_por: "",
    searchOption: "texto",
    maxprov: String(MAXPROV),
    tipo: "json",
  });
  return { sourceKey: SOURCE_KEY, url: `${BUSCADOR}?${q}`, method: "GET" as const };
}

/** La consulta de un año entero. */
export function peticionAnio(anio: number) {
  return peticionVentana({ fini: `${anio}-01-01`, ffin: `${anio}-12-31` });
}

/**
 * Parte una ventana en dos mitades por fecha.
 *
 * Hace falta porque `maxprov` trunca EN SILENCIO: medido, 2023 tiene 3.705
 * providencias y una consulta anual devuelve 2.000 con `HTTP 200`. Sin partir
 * la ventana se pierden 1.705 y nada avisa — solo el contraste contra
 * `hits.total.value`, que es exactamente para lo que sirve.
 *
 * Se parte por MITADES sucesivas y no en trozos fijos: los años no reparten sus
 * providencias de forma uniforme, así que un trimestre fijo puede seguir
 * pasándose mientras otro gasta una petición para traer treinta registros.
 */
export function partirVentana(v: Ventana): [Ventana, Ventana] {
  const ini = new Date(`${v.fini}T00:00:00Z`).getTime();
  const fin = new Date(`${v.ffin}T00:00:00Z`).getTime();
  if (!(fin > ini)) throw new Error(`ventana no divisible: ${v.fini}..${v.ffin}`);

  const medio = new Date(ini + Math.floor((fin - ini) / 2));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const siguiente = new Date(medio.getTime() + 86_400_000);
  return [
    { fini: v.fini, ffin: iso(medio) },
    { fini: iso(siguiente), ffin: v.ffin },
  ];
}

/**
 * Interpreta la respuesta del buscador.
 *
 * Lanza SOLO si no hay nada que interpretar. Todo lo demás sale por
 * `anomalias`: un tipo de providencia nuevo no puede abortar el backfill de un
 * año entero.
 */
export function parseRelatoria(texto: string): ResultadoRelatoria {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    throw new Error(`la relatoría no devolvió JSON: ${String(e)}`);
  }

  const anomalias: Anomalia[] = [];
  const raiz = json as { data?: unknown };

  // La envoltura importa: `hits` NO está en la raíz, está bajo `data`.
  const data = raiz?.data as
    | { hits?: { hits?: unknown[]; total?: { value?: number } } }
    | undefined;
  const hits = data?.hits?.hits;

  if (!Array.isArray(hits)) {
    throw new Error(
      "envelope inesperado: se esperaba data.hits.hits[]; llegó " +
        `${JSON.stringify(Object.keys(raiz ?? {}))}`,
    );
  }

  const totalDeclarado =
    typeof data?.hits?.total?.value === "number" ? data.hits.total.value : null;

  // Se cuenta lo RECIBIDO. `total` solo contrasta.
  if (totalDeclarado !== null && totalDeclarado !== hits.length) {
    anomalias.push({
      clase: "total-no-cuadra",
      detalle: `hits.total.value=${totalDeclarado} pero llegaron ${hits.length} registros — posible truncamiento por maxprov`,
    });
  }

  const vistos = new Set<number>();
  const providencias: Providencia[] = [];

  for (const hit of hits) {
    const src = (hit as { _source?: ProvidenciaRaw })._source;
    if (!src) {
      anomalias.push({ clase: "envelope-inesperado", detalle: "hit sin _source" });
      continue;
    }

    if (vistos.has(src.prov_id)) {
      anomalias.push({ clase: "id-duplicado", detalle: `prov_id ${src.prov_id} repetido` });
    }
    vistos.add(src.prov_id);

    const tipoDesconocido = !(TIPOS_PROVIDENCIA as readonly string[]).includes(src.prov_tipo);
    if (tipoDesconocido) {
      anomalias.push({
        clase: "tipo-desconocido",
        detalle: `prov_id ${src.prov_id}: prov_tipo ${JSON.stringify(src.prov_tipo)} no es uno de los 4 medidos`,
      });
    }

    const url = urlTexto(src.rutahtml);
    if (!url) {
      anomalias.push({
        clase: "sin-rutahtml",
        detalle: `prov_id ${src.prov_id} (${src.prov_sentencia}) sin rutahtml: no hay texto completo que pedir`,
      });
    }

    const fPub = fechaIso(src.prov_f_public);
    if (src.prov_f_public && !fPub) {
      anomalias.push({
        clase: "fecha-ilegible",
        detalle: `prov_id ${src.prov_id}: prov_f_public ${JSON.stringify(src.prov_f_public)}`,
      });
    }

    providencias.push({
      id: src.prov_id,
      sentencia: src.prov_sentencia ?? "",
      tipo: src.prov_tipo ?? "",
      tipoDesconocido,
      fechaPublicacion: fPub,
      fechaSentencia: fechaIso(src.prov_f_sentencia),
      expediente: src.prov_expediente ?? "",
      magistrados: Array.isArray(src.prov_magistrados) ? src.prov_magistrados : [],
      tema: src.prov_tema ?? "",
      urlTexto: url,
      raw: src,
    });
  }

  return { providencias, anomalias, totalDeclarado };
}
