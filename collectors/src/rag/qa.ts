/**
 * Capa de Q&A con citas. La forma de la petición y la lectura de la respuesta.
 *
 * Lógica pura: se escribe y se prueba sin llamar a ningún modelo, y conviene
 * tenerlo antes de la primera llamada real — después, la tentación es aceptar
 * la respuesta bonita que llegó.
 *
 * ## Por qué esto ya no habla con la Citations API de Anthropic (2026-08-20)
 *
 * El plan (§8.2, R2) construía las citas con bloques `search_result` de la API
 * de Anthropic, que devuelve el `source` de cada cita y garantiza que
 * `cited_text` es texto LITERAL del bloque. Eso exigía `ANTHROPIC_API_KEY` y
 * facturaba. El transporte vivo NO es esa API: el modelo se invoca por
 * **Claude Code con la sesión OAuth del usuario** (`proveedor-claude-code.ts`).
 * No hay clave de Anthropic en el entorno de este repo.
 *
 * Cambia el transporte y **no** cambia R2, pero sí cambia DÓNDE se hace
 * cumplir, y eso hay que decirlo:
 *
 * | | Citations API | Aquí |
 * |---|---|---|
 * | El id del chunk vuelve en la cita | lo garantiza la API (`source`) | lo declara el modelo, y `validarCitas` lo comprueba contra los chunks que ENTRARON |
 * | La cita es texto literal de la fuente | lo garantiza la API | **lo comprueba `verificarTextualidad()`**: la cita tiene que aparecer en el texto del chunk o se cae |
 *
 * La segunda fila es una mejora, no un apaño: antes se confiaba en que la API
 * extrajera bien; ahora se comprueba contra el texto que se envió. Lo que
 * NINGUNA de las dos versiones cubre —y no se va a fingir que sí— es que citas
 * literales y correctas se hilen en una inferencia que la fuente no sostiene.
 * Eso lo atrapa el gold set (R7), no el validador.
 *
 * ## R3 («dos llamadas, no una») ya no aplica, y por eso se ha quitado
 *
 * Existía porque en la API de Anthropic citations y structured outputs son
 * incompatibles (400). Fuera de esa API la restricción no existe: aquí el
 * modelo devuelve un único JSON con las frases y sus citas. Mantener dos
 * llamadas «porque lo dice el plan» sería copiar la forma de una restricción
 * que ya no está.
 */

import type { Chunk } from "./chunking.ts";
import { type FraseCitada, type ResultadoValidacion, validarCitas } from "./citas.ts";

/** Una pieza de evidencia tal como se le pasa al modelo. */
export interface Evidencia {
  /** El `chunk_id`. Es lo que el modelo tiene que devolver en cada cita. */
  readonly chunk_id: string;
  /** Referencia legible («Ley 1616 de 2013, artículo 36»). Para el lector. */
  readonly referencia: string;
  readonly texto: string;
}

/**
 * Convierte chunks en evidencia citable.
 *
 * `chunk_id` y `referencia` van separados por la misma razón por la que iban
 * separados `source` y `title`: `chunk_id` es lo que se COMPARA al validar,
 * `referencia` lo que ve el lector. Si la validación dependiera de cómo se
 * redacta una referencia, cambiar un título rompería las citas.
 */
export function construirEvidencia(chunks: readonly Chunk[]): Evidencia[] {
  return chunks.map((c) => ({ chunk_id: c.id, referencia: c.referencia, texto: c.texto }));
}

/** Una cita tal como la declara el modelo. */
export interface CitaDeclarada {
  readonly chunk_id: string;
  /** Fragmento que el modelo dice haber leído. Se comprueba, no se cree. */
  readonly cita_textual: string;
}

export interface FraseDeclarada {
  readonly texto: string;
  readonly citas: readonly CitaDeclarada[];
}

/**
 * La respuesta del modelo no se pudo LEER.
 *
 * Existe para separar dos cosas que antes salían idénticas y no lo son:
 * «el modelo declinó y devolvió cero frases» es una respuesta legítima sobre el
 * corpus, y «no se pudo interpretar lo que devolvió» es un FALLO del sistema.
 * Las dos producían `[]`, y aguas abajo `run-qa.ts` convertía ese `[]` en una
 * afirmación sobre el corpus —«no está en lo capturado»—: exactamente la
 * confusión que este proyecto vigila, rota por el otro lado.
 */
export class RespuestaIlegible extends Error {
  // Campo declarado y asignado a mano, NO una propiedad de parámetro
  // (`constructor(readonly motivo: string)`). Node corre estos `.ts` con
  // *type stripping*, que no soporta esa forma: vitest transpila con esbuild y
  // los tests pasaban en verde mientras `pnpm qa` y `pnpm gold:run` reventaban
  // con ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. Es la costura entre lo que se prueba
  // y lo que se ejecuta.
  readonly motivo: string;

  constructor(motivo: string) {
    super(`no se pudo leer la respuesta del modelo: ${motivo}`);
    this.name = "RespuestaIlegible";
    this.motivo = motivo;
  }
}

/**
 * Lee el JSON del modelo sin fiarse de su forma.
 *
 * Un modelo puede envolver el JSON en ```json o añadir prosa antes, y eso se
 * tolera. Lo que NO se tolera es no poder leerlo: eso lanza `RespuestaIlegible`
 * en vez de devolver la lista vacía. Dentro de un JSON bien formado sí se
 * descarta lo que no encaje —una frase sin texto, una cita a medias—, porque
 * descartar publica de menos y eso es seguro.
 */
export function parsearRespuesta(bruto: string): FraseDeclarada[] {
  const limpio = bruto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // Si vino prosa alrededor, se rescata el primer objeto JSON de nivel raíz.
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin <= inicio) {
    throw new RespuestaIlegible("no hay ningún objeto JSON en la salida");
  }

  let json: unknown;
  try {
    json = JSON.parse(limpio.slice(inicio, fin + 1));
  } catch (e) {
    throw new RespuestaIlegible(`el JSON no se pudo analizar: ${(e as Error).message}`);
  }

  const frases = (json as { frases?: unknown }).frases;
  if (!Array.isArray(frases)) {
    throw new RespuestaIlegible("el objeto no trae la clave `frases` como lista");
  }

  const out: FraseDeclarada[] = [];
  for (const f of frases) {
    const texto = (f as { texto?: unknown }).texto;
    if (typeof texto !== "string" || texto.trim() === "") continue;
    const citasBrutas = (f as { citas?: unknown }).citas;
    const citas: CitaDeclarada[] = [];
    if (Array.isArray(citasBrutas)) {
      for (const c of citasBrutas) {
        const id = (c as { chunk_id?: unknown }).chunk_id;
        const lit = (c as { cita_textual?: unknown }).cita_textual;
        if (typeof id === "string" && id !== "" && typeof lit === "string") {
          citas.push({ chunk_id: id, cita_textual: lit });
        }
      }
    }
    // Una frase sin citas bien formadas NO se descarta aquí: se conserva con la
    // lista vacía para que `validarCitas` la elimine y la CUENTE. Descartarla
    // ahora escondería cuánta respuesta venía sin apoyo, que es la métrica.
    out.push({ texto: texto.trim(), citas });
  }
  return out;
}

/**
 * Normaliza para comparar: espacios colapsados, comillas tipográficas y
 * guiones unificados, minúsculas y sin tildes.
 *
 * No es laxitud. Un modelo reproduce el fragmento con la comilla curva que
 * copió, o parte una línea distinto; exigir igualdad byte a byte rechazaría
 * citas HONESTAS y empujaría a bajar el listón entero. Lo que esta
 * normalización NO hace es tolerar palabras distintas, que es lo que importa.
 */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Cuántos caracteres tiene que tener una cita para contar como tal. */
const MIN_CITA = 12;

export interface ResultadoTextualidad {
  /** Frases con sus citas ya depuradas, listas para `validarCitas`. */
  readonly frases: FraseCitada[];
  /**
   * Citas descartadas, CON EL MOTIVO, que no es un adorno.
   *
   * Los dos motivos se descartan igual y significan cosas muy distintas:
   *
   * - `no_literal`: el modelo entrecomilló algo que la fuente NO dice. Es la
   *   señal más dura que produce esta capa y lo que el gold set cuenta como
   *   fabricación.
   * - `demasiado_corta`: la cita es literal, pero tan corta que no identifica
   *   nada («la», «el artículo»). Se descarta por prudencia, no por falsedad.
   *
   * Meterlas en el mismo cubo hacía que el arnés denunciara «la fuente no lo
   * dice» de una cita que la fuente SÍ dice, y eso corrompe la única métrica
   * que el gold set garantiza.
   */
  readonly noLiterales: readonly {
    readonly chunkId: string;
    readonly citaTextual: string;
    readonly motivo: "no_literal" | "demasiado_corta";
  }[];
}

/**
 * LA COMPROBACIÓN QUE SUSTITUYE A LA GARANTÍA DE LA API.
 *
 * Cada cita declara un fragmento; ese fragmento tiene que aparecer, literal, en
 * el texto del chunk citado. La que no aparece se cae — y con ella se cae la
 * frase si no le queda ninguna cita buena, por obra de `validarCitas`.
 *
 * Una cita a un chunk que no se le pasó al modelo se deja pasar TAL CUAL a
 * `validarCitas`: ahí es donde se cuenta como cita fantasma, y contarla dos
 * veces con dos nombres distintos haría ilegible la métrica.
 */
export function verificarTextualidad(
  frases: readonly FraseDeclarada[],
  chunks: readonly Chunk[],
): ResultadoTextualidad {
  const textoPorId = new Map(chunks.map((c) => [c.id, normalizar(c.texto)]));
  const noLiterales: {
    chunkId: string;
    citaTextual: string;
    motivo: "no_literal" | "demasiado_corta";
  }[] = [];
  const salida: FraseCitada[] = [];

  for (const f of frases) {
    const buenas: string[] = [];
    for (const c of f.citas) {
      const texto = textoPorId.get(c.chunk_id);
      // Chunk desconocido: no se puede comprobar la literalidad, y no es aquí
      // donde se juzga. Pasa a `validarCitas`, que lo marcará como fantasma.
      if (texto === undefined) {
        buenas.push(c.chunk_id);
        continue;
      }
      const cita = normalizar(c.cita_textual);
      if (cita.length < MIN_CITA) {
        noLiterales.push({
          chunkId: c.chunk_id,
          citaTextual: c.cita_textual,
          motivo: "demasiado_corta",
        });
        continue;
      }
      if (!texto.includes(cita)) {
        noLiterales.push({
          chunkId: c.chunk_id,
          citaTextual: c.cita_textual,
          motivo: "no_literal",
        });
        continue;
      }
      buenas.push(c.chunk_id);
    }
    salida.push({ texto: f.texto, citas: buenas });
  }

  return { frases: salida, noLiterales };
}

/** Una fuente citada, con lo que hace falta para ir a comprobarla. */
export interface Referencia {
  readonly chunkId: string;
  /** Legible: «Ley 1616 de 2013, artículo 1». */
  readonly referencia: string;
  readonly urlFuente: string;
  readonly capturedAt: string;
}

export interface RespuestaQa {
  readonly validacion: ResultadoValidacion;
  /** El texto que se puede publicar, ya filtrado. */
  readonly texto: string;
  /**
   * Los chunks efectivamente citados, CON SU PROCEDENCIA.
   *
   * No es una lista de cadenas legibles: el contrato de procedencia del
   * proyecto dice que todo lo que se publica lleva `url_fuente` y
   * `captured_at`, y la lista de «Fuentes» de una respuesta es lo más parecido
   * que hay a una cita bibliográfica — precisamente donde el lector espera
   * poder ir a comprobarlo. Antes salía «Ley 1616 de 2013, artículo 1» a secas:
   * verificable solo si el lector ya sabía dónde buscar.
   */
  readonly referencias: readonly Referencia[];
  /** Citas descartadas, con su motivo (`no_literal` / `demasiado_corta`). */
  readonly noLiterales: ResultadoTextualidad["noLiterales"];
}

/**
 * Procesa la respuesta del modelo de punta a punta: parsea, comprueba
 * literalidad, valida citas y arma el texto publicable.
 *
 * Nunca devuelve una frase sin cita válida. Si no queda nada, `texto` es la
 * cadena vacía — y quien llame tiene que tratar eso como «no hay evidencia
 * suficiente», no como una respuesta corta.
 */
export function procesarRespuesta(bruto: string, chunks: readonly Chunk[]): RespuestaQa {
  const declaradas = parsearRespuesta(bruto);
  const { frases, noLiterales } = verificarTextualidad(declaradas, chunks);
  const validacion = validarCitas(
    frases,
    chunks.map((c) => c.id),
  );

  const porId = new Map(chunks.map((c) => [c.id, c]));
  const usados = new Set<string>();
  for (const f of validacion.publicables) for (const c of f.citas) usados.add(c);

  const referencias: Referencia[] = [...usados]
    .map((id) => {
      const c = porId.get(id);
      return {
        chunkId: id,
        referencia: c?.referencia ?? id,
        urlFuente: c?.urlFuente ?? "",
        capturedAt: c?.capturedAt ?? "",
      };
    })
    .sort((a, b) => a.referencia.localeCompare(b.referencia, "es"));

  return {
    validacion,
    texto: validacion.publicables.map((f) => f.texto).join(" "),
    referencias,
    noLiterales,
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
  "",
  "## Formato de salida (obligatorio)",
  "",
  "Devuelve SOLO un objeto JSON, sin markdown y sin texto alrededor:",
  "",
  '{"frases": [{"texto": "…", "citas": [{"chunk_id": "…", "cita_textual": "…"}]}]}',
  "",
  "Una entrada de `frases` por afirmación. `chunk_id` tiene que ser uno de los",
  "que se te dieron, copiado exactamente.",
  "",
  "`cita_textual` es un fragmento COPIADO LETRA POR LETRA del texto de ese",
  "chunk, de al menos 12 caracteres. No lo parafrasees, no lo resumas y no lo",
  "corrijas: se comprueba contra el texto original y la cita que no aparezca",
  "literalmente se descarta, y con ella la afirmación que sostenía.",
  "",
  "Si no puedes sostener una afirmación con un fragmento literal, no la",
  "escribas.",
].join("\n");
