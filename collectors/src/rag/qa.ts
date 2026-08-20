/**
 * Capa de Q&A con citas. La forma de la petición y la lectura de la respuesta.
 *
 * Lo único que necesita clave de API es la llamada; todo lo de aquí se escribe
 * y se prueba sin gastar un token, y conviene tenerlo antes de la primera
 * llamada real — después, la tentación es aceptar la respuesta bonita que llegó.
 *
 * ## Por qué bloques `search_result` y no `document` (§8.2)
 *
 * Con bloques `document`, validar «que cada cita resuelva a un `chunk_id`»
 * obliga a reconstruir la identidad del chunk desde `document_index` más
 * offsets de caracteres, con un mapa paralelo que **se desincroniza en cuanto
 * cambie el orden de los documentos del request**. Y se desincroniza en
 * silencio: las citas siguen resolviendo, solo que al chunk equivocado.
 *
 * Los bloques `search_result` llevan `source` y `title` propios, así que la
 * cita vuelve con el identificador dentro. R2 pasa de ser aritmética de
 * offsets a ser una comparación de cadenas.
 *
 * ## R3: dos llamadas, no una
 *
 * Citations y structured outputs son **incompatibles** (la API responde 400).
 * La extracción estructurada y la redacción citada son pasos separados, y
 * mezclarlos no es una optimización: es un error de 400 en producción.
 */

import type { Chunk } from "./chunking.ts";
import { type FraseCitada, type ResultadoValidacion, validarCitas } from "./citas.ts";

/** Un bloque `search_result` tal como lo espera la API. */
export interface BloqueSearchResult {
  readonly type: "search_result";
  /** El identificador del chunk viaja AQUÍ, y por eso vuelve en la cita. */
  readonly source: string;
  readonly title: string;
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly citations: { readonly enabled: true };
}

/**
 * Convierte chunks en bloques citables.
 *
 * `source` es el `chunk.id` y `title` la referencia legible. La separación
 * importa: `source` es lo que se compara al validar, `title` lo que ve el
 * lector. Meter la referencia legible en `source` haría que la validación
 * dependiera de cómo se redacta un título.
 */
export function construirBloques(chunks: readonly Chunk[]): BloqueSearchResult[] {
  return chunks.map((c) => ({
    type: "search_result" as const,
    source: c.id,
    title: c.referencia,
    content: [{ type: "text" as const, text: c.texto }],
    citations: { enabled: true as const },
  }));
}

/** Bloque de cita que devuelve la API sobre un `search_result`. */
interface CitaApi {
  readonly type?: string;
  readonly cited_text?: string;
  readonly source?: string;
  readonly title?: string;
}

/** Bloque de contenido de la respuesta. */
interface BloqueRespuesta {
  readonly type?: string;
  readonly text?: string;
  readonly citations?: CitaApi[] | null;
}

/**
 * Extrae frases con sus citas de la respuesta del modelo.
 *
 * Cada bloque de texto con `citations` es una frase respaldada; los bloques sin
 * `citations` son texto sin respaldo, y se conservan **con la lista de citas
 * vacía** para que `validarCitas` los elimine. Descartarlos aquí escondería
 * cuánta respuesta venía sin apoyo, que es justo la métrica que interesa.
 */
export function extraerFrases(contenido: readonly BloqueRespuesta[]): FraseCitada[] {
  const out: FraseCitada[] = [];
  for (const b of contenido) {
    if (b.type !== "text" || typeof b.text !== "string") continue;
    const texto = b.text.trim();
    if (texto === "") continue;
    const citas = (b.citations ?? [])
      .map((c) => c.source)
      .filter((s): s is string => typeof s === "string" && s !== "");
    out.push({ texto, citas });
  }
  return out;
}

export interface RespuestaQa {
  readonly validacion: ResultadoValidacion;
  /** El texto que se puede publicar, ya filtrado. */
  readonly texto: string;
  /** Referencias legibles de los chunks efectivamente citados. */
  readonly referencias: readonly string[];
}

/**
 * Procesa la respuesta del modelo de punta a punta: extrae, valida y arma el
 * texto publicable.
 *
 * Nunca devuelve una frase sin cita válida. Si no queda nada, `texto` es la
 * cadena vacía — y quien llame tiene que tratar eso como «no hay evidencia
 * suficiente», no como una respuesta corta.
 */
export function procesarRespuesta(
  contenido: readonly BloqueRespuesta[],
  chunks: readonly Chunk[],
): RespuestaQa {
  const disponibles = chunks.map((c) => c.id);
  const validacion = validarCitas(extraerFrases(contenido), disponibles);

  const porId = new Map(chunks.map((c) => [c.id, c.referencia]));
  const usados = new Set<string>();
  for (const f of validacion.publicables) for (const c of f.citas) usados.add(c);

  return {
    validacion,
    texto: validacion.publicables.map((f) => f.texto).join(" "),
    referencias: [...usados].map((id) => porId.get(id) ?? id).sort(),
  };
}

/**
 * Instrucción del sistema.
 *
 * Dice lo que el sistema NO debe hacer con más detalle que lo que debe, porque
 * los fallos de esta clase de asistente son por exceso: responder de más,
 * suavizar una negativa, o convertir «no consta» en «no hay».
 */
export const SISTEMA = [
  "Eres un asistente de consulta normativa colombiana.",
  "",
  "Responde ÚNICAMENTE con lo que sostengan los resultados de búsqueda que se",
  "te dan. Cada afirmación tiene que ir citada.",
  "",
  "Si los resultados no sostienen una respuesta, dilo. «No consta en el corpus»",
  "es una respuesta correcta y preferible a una redacción plausible.",
  "",
  // Un concepto por línea: si una frase se parte en el `join`, deja de leerse
  // como una regla y se convierte en dos medias reglas.
  "No afirmes que una norma está vigente salvo que un resultado lo declare con su fuente.",
  "Un proyecto de ley NO es una ley.",
  "Un archivo NO significa que el tema esté cerrado: puede volver a radicarse.",
  "Que no aparezca algo NO significa que no exista: significa que no está en lo que se te dio.",
  "",
  "No des asesoría jurídica. Describe lo que dicen las fuentes y deja la lectura",
  "jurídica a quien consulte el texto oficial.",
].join("\n");
