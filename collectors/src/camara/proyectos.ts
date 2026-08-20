/**
 * Cámara de Representantes — proyectos de ley.
 *
 * ## ⛔ ESTE COLECTOR NO SE EJECUTA TODAVÍA, Y LA GUARDA ES DE VERDAD
 *
 * Las «Políticas de uso» de camara.gov.co prohíben el **almacenamiento** de los
 * contenidos del portal sin autorización previa y escrita, y el verbo alcanza
 * directamente lo que hace un colector. La excepción que la propia cláusula
 * prevé exige tres condiciones acumulativas —uso personal, no comercial y
 * mención de la propiedad— y regwatch-co cumple dos: **al ser un servicio
 * público no encaja en «personal»**.
 *
 * Así que no se invoca la excepción: se pide la autorización. El derecho de
 * petición está redactado en `legal/peticiones/camara-representantes.md`.
 *
 * **El código sí se puede escribir** —el plan lo dice— y se escribe ahora
 * porque el conocimiento de cómo funciona esta fuente está fresco y medido. Lo
 * que no se puede es correrlo. `verificarAutorizacion()` lanza mientras no
 * exista la constancia de radicación con respuesta favorable, y `recolectar()`
 * la llama antes de tocar la red.
 *
 * ## Lo medido de la fuente (research/refute2-congreso.json)
 *
 * - `POST /wp-admin/admin-ajax.php` con `action=get_proyectos_ley_page`.
 * - Respuesta `{success, data: {items, total, total_pages}}`.
 * - **El `_ajax_nonce` NO se valida.** Responde igual con un nonce falso y
 *   omitiéndolo por completo; los 6.446 registros del corpus se bajaron con
 *   `_ajax_nonce='x'`. Scrapear el nonce resuelve un problema que no existe, y
 *   por eso queda fuera del presupuesto.
 * - `legislatura=All` → 6.446 registros en 65 páginas. `legislatura=3`
 *   (2024-2025) → 643.
 * - ⚠️ El `value` del selector **no es el año**: es un índice interno.
 * - `robots.txt` permite explícitamente `admin-ajax.php`
 *   (`Disallow: /wp-admin/` + `Allow: /wp-admin/admin-ajax.php`).
 */

export const ENDPOINT = "https://www.camara.gov.co/wp-admin/admin-ajax.php";
export const SOURCE_KEY = "camara-ajax";

/**
 * Estado de la autorización del artículo 3.1 de las Políticas de uso.
 *
 * Vive en código y no en una variable de entorno a propósito: cambiarlo es una
 * decisión que deja rastro en el historial de git, con fecha y con quien la
 * tomó. Un `CAMARA_AUTORIZADA=1` en un `.env` no deja nada.
 */
export const AUTORIZACION = {
  /** Cambiar SOLO cuando exista respuesta favorable, y anotar el radicado. */
  concedida: false,
  radicado: null as string | null,
  fechaRespuesta: null as string | null,
  peticion: "legal/peticiones/camara-representantes.md",
} as const;

export class AutorizacionPendienteError extends Error {
  constructor() {
    super(
      "El colector de Cámara NO puede ejecutarse: las Políticas de uso de " +
        "camara.gov.co prohíben el almacenamiento sin autorización previa y " +
        "escrita, y el derecho de petición sigue sin respuesta favorable " +
        `(${AUTORIZACION.peticion}). Radicarlo y anotar el radicado en ` +
        "AUTORIZACION antes de volver a intentarlo. Esto no es un flag de " +
        "configuración: es la condición legal para tocar esta fuente.",
    );
    this.name = "AutorizacionPendienteError";
  }
}

/** Se llama ANTES de cualquier petición de red. Lanza si no hay autorización. */
export function verificarAutorizacion(): void {
  if (!AUTORIZACION.concedida) throw new AutorizacionPendienteError();
}

/** Fila cruda del listado, según la forma medida. */
export interface ProyectoCamaraRaw {
  readonly numero_camara?: string;
  readonly numero_senado?: string;
  readonly titulo?: string;
  readonly estado?: string;
  readonly comision?: string;
  readonly origen?: string;
  readonly legislatura?: string;
  readonly autores?: string;
  readonly [k: string]: unknown;
}

export interface Anomalia {
  readonly clase: "envelope-inesperado" | "total-no-cuadra" | "pagina-vacia" | "sin-numero";
  readonly detalle: string;
}

export interface ResultadoCamara {
  readonly items: readonly ProyectoCamaraRaw[];
  readonly total: number | null;
  readonly totalPaginas: number | null;
  readonly anomalias: readonly Anomalia[];
}

/**
 * La petición de una página.
 *
 * `_ajax_nonce` se manda con un valor fijo y evidente. NO se scrapea: está
 * medido que la fuente no lo valida, y montar un scraper de nonce con su ruta
 * de fallo por caché resolvería un problema que hoy no existe. Si algún día
 * empieza a validarse, este es el punto donde se nota — y entonces se decide,
 * con la medición delante.
 */
export function peticionPagina(pagina: number, legislatura = "All", porPagina = 100) {
  return {
    sourceKey: SOURCE_KEY,
    url: ENDPOINT,
    method: "POST" as const,
    form: {
      action: "get_proyectos_ley_page",
      _ajax_nonce: "x",
      page: String(pagina),
      per_page: String(porPagina),
      legislatura,
    },
  };
}

/** Interpreta `{success, data:{items,total,total_pages}}`. */
export function parseCamara(texto: string, paginaEsperada: number): ResultadoCamara {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    throw new Error(`admin-ajax no devolvió JSON: ${String(e)}`);
  }

  const anomalias: Anomalia[] = [];
  const env = json as { success?: unknown; data?: unknown };

  if (env.success !== true) {
    anomalias.push({
      clase: "envelope-inesperado",
      detalle: `success = ${JSON.stringify(env.success)} (se esperaba true)`,
    });
  }

  const data = env.data as { items?: unknown; total?: unknown; total_pages?: unknown } | undefined;
  if (!data || !Array.isArray(data.items)) {
    throw new Error(
      `envelope inesperado: se esperaba data.items[]; llegó ${JSON.stringify(Object.keys(env ?? {}))}`,
    );
  }

  const items = data.items as ProyectoCamaraRaw[];
  const total = typeof data.total === "number" ? data.total : null;
  const totalPaginas = typeof data.total_pages === "number" ? data.total_pages : null;

  // Una página vacía dentro del rango declarado es una señal, no un final.
  if (items.length === 0 && totalPaginas !== null && paginaEsperada <= totalPaginas) {
    anomalias.push({
      clase: "pagina-vacia",
      detalle: `página ${paginaEsperada} de ${totalPaginas} llegó vacía`,
    });
  }

  for (const it of items) {
    if (!it.numero_camara && !it.numero_senado) {
      anomalias.push({
        clase: "sin-numero",
        detalle: `fila sin numero_camara ni numero_senado: ${JSON.stringify(it).slice(0, 120)}`,
      });
    }
  }

  return { items, total, totalPaginas, anomalias };
}

/**
 * Recolección completa. **Lanza antes de tocar la red si no hay autorización.**
 */
export async function recolectar(): Promise<never> {
  verificarAutorizacion();
  // Inalcanzable mientras AUTORIZACION.concedida sea false. Cuando se conceda,
  // aquí va el bucle de páginas con la pausa de cortesía de http.ts.
  throw new Error("no implementado: se completa cuando la autorización exista");
}
