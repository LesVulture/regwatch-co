/**
 * Colector de proyectos de ley del Senado.
 *
 * Fuente: `POST https://leyes.senado.gov.co/api/search_pdly.php` con
 * `legislatura=YYYY-YYYY`. Medido el 2026-08-20: la legislatura 2024-2025
 * devuelve 471 filas, `total_results: 471`, 350.386 bytes.
 *
 * Este módulo NO pide por red: recibe bytes y los interpreta. Esa separación es
 * la que permite testear el parseo contra fixtures reales sin tocar la fuente.
 *
 * **Regla que gobierna el fichero:** ningún campo se inventa y ningún fallo se
 * traga. Un envelope raro, un `total_results` que no cuadra o un estado
 * desconocido son HALLAZGOS que salen en el resultado, no excepciones que
 * aborten el lote ni valores adivinados.
 */

import { type Crosswalk, clasificarCrosswalk, parseNumero } from "./crosswalk.ts";
import { type EstadoNormalizado, normalizarEstado } from "./estados.ts";

export const ENDPOINT_PDLY = "https://leyes.senado.gov.co/api/search_pdly.php";
export const SOURCE_KEY = "senado-pdly";

/** Fila cruda, tal como la publica la API. Se conserva íntegra. */
export interface PdlyRaw {
  readonly id: number;
  readonly numero_senado: string;
  readonly numero_camara: string;
  readonly cuatrenio: string;
  readonly titulo: string;
  readonly autor: string;
  readonly comision: string;
  readonly estado: string;
  readonly type: string;
}

/** Los 9 campos medidos. Si la fuente añade o quita uno, se quiere saber. */
const CAMPOS_ESPERADOS = [
  "id",
  "numero_senado",
  "numero_camara",
  "cuatrenio",
  "titulo",
  "autor",
  "comision",
  "estado",
  "type",
] as const;

export interface ProyectoSenado {
  readonly id: number;
  /** Forma canónica comparable entre cámaras, p. ej. `001/24`. */
  readonly numeroSenadoCanonico: string | null;
  readonly numeroSenadoRaw: string;
  /**
   * Clasificación del crosswalk contra Cámara. Se usa `clasificarCrosswalk` y
   * no `parseNumero` a secas porque el primero conserva el `motivo`, que es
   * procedencia: por qué esta fila quedó sin contraparte se guarda, no se
   * reconstruye después de memoria.
   */
  readonly crosswalk: Crosswalk;
  readonly titulo: string;
  readonly autor: string;
  readonly comision: string;
  readonly estado: EstadoNormalizado;
  readonly cuatrenio: string;
  /** La fila cruda íntegra. La evidencia no se descarta al normalizar. */
  readonly raw: PdlyRaw;
}

/** Todo lo que salió raro. Se reporta; no se lanza. */
export interface Anomalia {
  readonly clase:
    | "envelope-inesperado"
    | "total-no-cuadra"
    | "campos-cambiados"
    | "estado-desconocido"
    | "numero-ilegible"
    | "id-duplicado";
  readonly detalle: string;
}

export interface ResultadoPdly {
  readonly proyectos: readonly ProyectoSenado[];
  readonly anomalias: readonly Anomalia[];
  /** Lo que la fuente DICE que hay, que no siempre es lo que manda. */
  readonly totalDeclarado: number | null;
}

/**
 * Interpreta la respuesta de `search_pdly.php`.
 *
 * Lanza SOLO si el cuerpo no es JSON o el envelope es irreconocible: en ese
 * caso no hay nada que normalizar. Cualquier otra rareza sale por `anomalias`,
 * porque una legislatura con un estado nuevo tiene que poder ingerirse.
 */
export function parsePdly(texto: string): ResultadoPdly {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    throw new Error(`search_pdly.php no devolvió JSON: ${String(e)}`);
  }

  const anomalias: Anomalia[] = [];

  if (typeof json !== "object" || json === null || !("data" in json)) {
    throw new Error(
      `envelope inesperado: se esperaba {success,data,total_results}, llegó ${JSON.stringify(json).slice(0, 200)}`,
    );
  }

  const envelope = json as { success?: unknown; data?: unknown; total_results?: unknown };

  if (envelope.success !== true) {
    anomalias.push({
      clase: "envelope-inesperado",
      detalle: `success = ${JSON.stringify(envelope.success)} (se esperaba true)`,
    });
  }

  if (!Array.isArray(envelope.data)) {
    throw new Error(`data no es un array: ${typeof envelope.data}`);
  }

  const filas = envelope.data as PdlyRaw[];
  const totalDeclarado = typeof envelope.total_results === "number" ? envelope.total_results : null;

  // LA COMPROBACIÓN QUE IMPORTA. El plan avisa de que `search_lys` topa en 100
  // filas EN SILENCIO. Si `total_results` no cuadra con lo recibido, la página
  // está truncada y tratarla como completa perdería proyectos sin avisar.
  if (totalDeclarado !== null && totalDeclarado !== filas.length) {
    anomalias.push({
      clase: "total-no-cuadra",
      detalle: `total_results=${totalDeclarado} pero llegaron ${filas.length} filas — respuesta truncada`,
    });
  }

  // ¿Sigue teniendo los 9 campos medidos?
  if (filas.length > 0) {
    const primera = filas[0] as unknown as Record<string, unknown>;
    const faltan = CAMPOS_ESPERADOS.filter((c) => !(c in primera));
    const sobran = Object.keys(primera).filter(
      (k) => !(CAMPOS_ESPERADOS as readonly string[]).includes(k),
    );
    if (faltan.length || sobran.length) {
      anomalias.push({
        clase: "campos-cambiados",
        detalle: `faltan: [${faltan.join(", ")}] · nuevos: [${sobran.join(", ")}]`,
      });
    }
  }

  const vistos = new Set<number>();
  const proyectos: ProyectoSenado[] = [];

  for (const fila of filas) {
    if (vistos.has(fila.id)) {
      anomalias.push({ clase: "id-duplicado", detalle: `id ${fila.id} repetido` });
    }
    vistos.add(fila.id);

    const estado = normalizarEstado(fila.estado);
    if (estado.requiereRevision) {
      anomalias.push({
        clase: "estado-desconocido",
        detalle: `id ${fila.id}: ${JSON.stringify(fila.estado)} — a revisión humana`,
      });
    }

    const senado = parseNumero(fila.numero_senado ?? "");
    if (senado.ilegible) {
      anomalias.push({
        clase: "numero-ilegible",
        detalle: `id ${fila.id}: numero_senado ${JSON.stringify(fila.numero_senado)}`,
      });
    }

    const cruce = clasificarCrosswalk(fila.numero_senado, fila.numero_camara);
    // Un `no_declarado` NO es anomalía: es el caso mayoritario (52,4 % en
    // 2024-2025). Lo que sí lo es: la fuente dice algo y no se entiende.
    if (cruce.estado === "ilegible") {
      anomalias.push({
        clase: "numero-ilegible",
        detalle: `id ${fila.id}: ${cruce.motivo}`,
      });
    }

    proyectos.push({
      id: fila.id,
      numeroSenadoCanonico: senado.principal?.canonico ?? null,
      numeroSenadoRaw: fila.numero_senado ?? "",
      crosswalk: cruce,
      titulo: fila.titulo ?? "",
      autor: fila.autor ?? "",
      comision: fila.comision ?? "",
      estado,
      cuatrenio: fila.cuatrenio ?? "",
      raw: fila,
    });
  }

  return { proyectos, anomalias, totalDeclarado };
}

/**
 * Ventana multi-legislatura, exigida por el plan desde el día 1: ingerir solo la
 * activa **rompe el crosswalk**, porque 111 de 219 `numero_camara` de una
 * legislatura no existen en el listado de Cámara de esa misma legislatura.
 */
export function legislaturas(desde: number, hasta: number): string[] {
  if (hasta < desde) throw new Error(`rango inválido: ${desde}-${hasta}`);
  const salida: string[] = [];
  for (let a = desde; a < hasta; a++) salida.push(`${a}-${a + 1}`);
  return salida;
}

/** La petición que hay que hacer para una legislatura. Sin red: solo el plan. */
export function peticionLegislatura(legislatura: string) {
  return {
    sourceKey: SOURCE_KEY,
    url: ENDPOINT_PDLY,
    method: "POST" as const,
    form: { legislatura },
  };
}
