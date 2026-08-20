/**
 * El contrato de evidencia, en código.
 *
 * Ningún dato entra sin procedencia checkeable. Esto no es una convención de
 * estilo: es la tesis del producto (PLAN-V2.md §10) y lo único que lo separa
 * de lo que ya existe. Todo lo demás del sistema depende de estos tipos.
 */

/**
 * Jerarquía probatoria. El orden importa y se compara: `primaria` gana a
 * `institucional`, que gana a `secundaria`.
 *
 * - `primaria`      — la entidad que produce el acto lo publica (Diario Oficial,
 *                     Gaceta del Congreso, la propia corporación).
 * - `institucional` — un tercero oficial que lo recoge (Congreso Visible, un
 *                     normograma sectorial).
 * - `secundaria`    — cualquier otra cosa: prensa, compilaciones privadas.
 */
export const TIERS = ["primaria", "institucional", "secundaria"] as const;
export type Tier = (typeof TIERS)[number];

const TIER_RANK: Record<Tier, number> = {
  primaria: 3,
  institucional: 2,
  secundaria: 1,
};

/** ¿`a` es al menos tan probatoria como `b`? */
export function tierAtLeast(a: Tier, b: Tier): boolean {
  return TIER_RANK[a] >= TIER_RANK[b];
}

/**
 * Una captura cruda. Se persiste ANTES de cualquier parseo (§7), incluso
 * cuando los gates la rechazan: la captura fallida es el punto de replay y
 * la prueba de que la fuente se rompió.
 */
export interface RawCapture {
  /** URL exacta pedida, con su query string. */
  readonly url: string;
  /** ISO 8601 UTC. Cuándo se pidió, no cuándo se procesó. */
  readonly capturedAt: string;
  /** SHA-256 hex del cuerpo sin normalizar. Detección de cambios. */
  readonly contentHash: string;
  /** Content-Type tal como lo devolvió el servidor, sin interpretar. */
  readonly contentType: string | null;
  readonly httpStatus: number;
  readonly byteLength: number;
  /** Clave de la fuente en el registro de expectativas. */
  readonly sourceKey: string;
}

/**
 * Cómo se obtuvo un dato derivado. La distinción entre estos dos valores es
 * la que un escéptico pilló falsificada en la investigación: una afectación
 * inferida de un tercero presentada como declarada en la norma.
 */
export const DERIVATIONS = ["declarado_en_norma", "parsed_from_text"] as const;
export type Derivation = (typeof DERIVATIONS)[number];

/**
 * Cómo se obtuvo una fecha de efecto. Es el agujero de R1 que la auditoría
 * destapó: `vigente_hasta` cuelga de `fecha_efecto`, así que si un LLM la
 * escribe, la vigencia sale del modelo por la puerta de atrás (§5.2).
 *
 * `no_determinable` NO es un fallo: es la respuesta correcta cuando la
 * cláusula no fija fecha. Un NULL declarado vale más que una fecha plausible.
 */
export const FECHA_DERIVATIONS = [
  "declarada_en_texto",
  "derivada_deterministicamente",
  "no_determinable",
] as const;
export type FechaDerivation = (typeof FECHA_DERIVATIONS)[number];

/** Procedencia mínima que acompaña a todo registro. Sin esto no se guarda. */
export interface Provenance {
  readonly urlFuentePrimaria: string;
  readonly capturedAt: string;
  readonly tier: Tier;
  /** Diario Oficial, Gaceta del Congreso… cuando aplique. */
  readonly publicacionOficial?: string;
}

/**
 * Un registro sin procedencia completa no se guarda. Se llama antes de todo
 * INSERT, y devuelve los motivos en vez de lanzar: quien llama decide si
 * manda a cuarentena o aborta el lote.
 */
export function validateProvenance(p: Partial<Provenance>): string[] {
  const errors: string[] = [];

  if (!p.urlFuentePrimaria) {
    errors.push("falta urlFuentePrimaria");
  } else if (!/^https?:\/\//i.test(p.urlFuentePrimaria)) {
    // http:// explícito es legítimo: la Secretaría del Senado solo responde
    // por HTTP (el 443 hace timeout). Está medido, no es un descuido.
    errors.push(`urlFuentePrimaria no es una URL http(s): ${p.urlFuentePrimaria}`);
  }

  if (!p.capturedAt) {
    errors.push("falta capturedAt");
  } else if (Number.isNaN(Date.parse(p.capturedAt))) {
    errors.push(`capturedAt no es una fecha ISO válida: ${p.capturedAt}`);
  }

  if (!p.tier) {
    errors.push("falta tier");
  } else if (!TIERS.includes(p.tier)) {
    errors.push(`tier fuera del enum: ${p.tier}`);
  }

  return errors;
}

/**
 * Un registro solo puede afirmarse `vigente` si su procedencia es primaria.
 * Es la regla R1 en su forma más simple, y la única que no admite excepción.
 */
export function puedeAfirmarVigencia(p: Provenance): boolean {
  return validateProvenance(p).length === 0 && tierAtLeast(p.tier, "primaria");
}

/** SHA-256 hex de un buffer. Usado para `contentHash` y para el dedup. */
export async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
