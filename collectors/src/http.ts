/**
 * Capa HTTP del recolector.
 *
 * Hace UNA cosa y la hace explícita: pedir bytes y devolverlos junto con la
 * procedencia necesaria para que el gate 0 pueda juzgarlos. No interpreta el
 * cuerpo, no reintenta en silencio y **no trata el 200 como éxito** — esa
 * decisión es del gate, y separarla es lo que impide que un soft-404 entre
 * como dato bueno.
 *
 * La cortesía no es opcional ni configurable a la baja: identificarse y espaciar
 * las peticiones es lo que sostiene los compromisos escritos en los derechos de
 * petición de `legal/peticiones/`. Si esos escritos prometen un ritmo, el código
 * es quien lo cumple.
 */

import { type RawCapture, sha256 } from "./evidence.ts";

/** Identidad del recolector. La MISMA que se usa para evaluar robots.txt. */
export const USER_AGENT =
  process.env.REGWATCH_USER_AGENT ?? "regwatch-co/0.1 (+https://github.com/LesVulture/regwatch-co)";

/** Milisegundos entre peticiones a un mismo host. Compromiso escrito, no un tuning. */
export const CORTESIA_MS = 2_000;

/** Techo de espera por petición. Sin esto, una fuente colgada bloquea el lote. */
export const TIMEOUT_MS = 60_000;

export interface FetchResult {
  readonly capture: RawCapture;
  readonly body: Uint8Array;
}

/** Inyectable para que los tests no toquen la red. */
export interface HttpDeps {
  readonly fetch: typeof globalThis.fetch;
  /** Reloj. Se inyecta para que las capturas sean deterministas en test. */
  readonly now: () => Date;
  /** Espera de cortesía. En test se anula. */
  readonly sleep: (ms: number) => Promise<void>;
}

export const depsPorDefecto: HttpDeps = {
  fetch: globalThis.fetch,
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export interface PeticionOpts {
  readonly sourceKey: string;
  readonly url: string;
  readonly method?: "GET" | "POST";
  /** Cuerpo de formulario. El Senado espera multipart/form-data. */
  readonly form?: Record<string, string>;
  readonly headers?: Record<string, string>;
}

/**
 * Pide una URL y devuelve los bytes con su procedencia.
 *
 * Un error de red NO se traga: se propaga. Una respuesta que llega —sea 200,
 * 404 o 500— siempre produce una `RawCapture`, porque incluso el fallo es
 * evidencia y tiene que poder persistirse (§7).
 */
export async function pedir(
  opts: PeticionOpts,
  deps: HttpDeps = depsPorDefecto,
): Promise<FetchResult> {
  const capturedAt = deps.now().toISOString();
  const control = new AbortController();
  const alarma = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    let cuerpoPeticion: FormData | undefined;
    if (opts.form) {
      cuerpoPeticion = new FormData();
      for (const [k, v] of Object.entries(opts.form)) cuerpoPeticion.append(k, v);
    }

    // `exactOptionalPropertyTypes` obliga a NO pasar la clave cuando no hay
    // cuerpo, en vez de pasarla como undefined.
    const init: RequestInit = {
      method: opts.method ?? (opts.form ? "POST" : "GET"),
      headers: { "User-Agent": USER_AGENT, ...opts.headers },
      signal: control.signal,
      redirect: "follow",
    };
    if (cuerpoPeticion) init.body = cuerpoPeticion;

    const res = await deps.fetch(opts.url, init);

    const body = new Uint8Array(await res.arrayBuffer());

    return {
      body,
      capture: {
        url: opts.url,
        capturedAt,
        contentHash: await sha256(body),
        contentType: res.headers.get("content-type"),
        httpStatus: res.status,
        byteLength: body.byteLength,
        sourceKey: opts.sourceKey,
      },
    };
  } finally {
    clearTimeout(alarma);
  }
}

/**
 * Recorre una lista de peticiones respetando la pausa de cortesía ENTRE ellas
 * (no antes de la primera ni después de la última: esperar de más también es
 * un coste, y el compromiso es sobre el ritmo, no sobre el reloj de pared).
 */
export async function pedirEnSerie(
  peticiones: readonly PeticionOpts[],
  deps: HttpDeps = depsPorDefecto,
  pausaMs: number = CORTESIA_MS,
): Promise<FetchResult[]> {
  const salida: FetchResult[] = [];
  for (const [i, p] of peticiones.entries()) {
    if (i > 0) await deps.sleep(pausaMs);
    salida.push(await pedir(p, deps));
  }
  return salida;
}
