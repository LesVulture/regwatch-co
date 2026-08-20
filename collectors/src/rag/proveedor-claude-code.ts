/**
 * El proveedor del modelo: Claude Code en modo `-p`, con la sesión OAuth del
 * usuario.
 *
 * ## Por qué el CLI y no la API
 *
 * El plan presupuestaba `ANTHROPIC_API_KEY` (§8.2: ~$18/mes a lista). La
 * instrucción del dueño del proyecto (2026-08-20) es que no haya ninguna
 * dependencia de pago más allá de Supabase y de Claude Code en su máquina.
 * `claude -p` usa la suscripción que ya tiene: **no hay clave de API en este
 * repo, ni en `.env`, ni en el entorno.**
 *
 * ## Lo que este módulo NO hace, y por qué importa
 *
 * No juzga la respuesta. Devuelve el texto crudo del modelo y se acaba su
 * trabajo: parsear, comprobar que las citas son literales y tirar lo que no se
 * sostiene es de `qa.ts`, que es lógica pura y se prueba sin invocar nada. Un
 * proveedor que además validara mezclaría «lo que dijo el modelo» con «lo que
 * el sistema acepta», y ahí es donde una respuesta bonita se cuela.
 *
 * ## Las tres barreras del subproceso
 *
 * 1. **Sin herramientas.** Se le pasa `--disallowed-tools` con todo lo que
 *    puede leer, escribir o salir a la red. El modelo tiene que responder con
 *    la evidencia del prompt: si pudiera abrir un fichero o buscar en la web,
 *    podría citar algo que NO está en el corpus y la validación de R2 lo daría
 *    por bueno — el `chunk_id` existiría igual.
 * 2. **Un turno.** `--max-turns 1`. No hay conversación que mantener.
 * 3. **Sin MCP.** `--strict-mcp-config` sin `--mcp-config`: no hereda los
 *    servidores del usuario. Misma razón que (1).
 */

import { spawn } from "node:child_process";
import type { Chunk } from "./chunking.ts";
import { construirEvidencia, SISTEMA } from "./qa.ts";

/**
 * Modelo. Sonnet y no Opus a propósito: la tarea es extraer y citar sobre
 * evidencia que ya viene recuperada, no razonar de cero, y la suscripción es un
 * recurso finito del usuario.
 */
export const MODELO = "sonnet";

/** Herramientas negadas. Todo lo que pueda traer texto de fuera del prompt. */
export const HERRAMIENTAS_NEGADAS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "TodoWrite",
];

/** Cuánto se espera al subproceso antes de darlo por colgado. */
export const TIMEOUT_MS = 180_000;

/** Los argumentos del CLI. Puro: se comprueban sin lanzar nada. */
export function argumentos(modelo: string = MODELO): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--model",
    modelo,
    // `--system-prompt` REEMPLAZA el system prompt de Claude Code en vez de
    // añadirse a él (`--append-system-prompt`). Es lo que se quiere: las
    // instrucciones de un asistente de programación no pintan nada aquí y
    // compiten con las reglas de R5/R7.
    "--system-prompt",
    SISTEMA,
    "--max-turns",
    "1",
    "--strict-mcp-config",
    "--disallowed-tools",
    ...HERRAMIENTAS_NEGADAS,
  ];
}

/**
 * El prompt. Puro.
 *
 * La evidencia va como JSON y no como prosa numerada: el modelo tiene que
 * devolver `chunk_id` copiado exacto, y un identificador dentro de una lista
 * numerada invita a devolver «el 3» en su lugar.
 */
export function construirPrompt(
  pregunta: string,
  chunks: readonly Chunk[],
  huecos: readonly string[] = [],
): string {
  const partes = [
    "## Evidencia disponible",
    "",
    JSON.stringify(construirEvidencia(chunks), null, 1),
    "",
  ];

  // LOS HUECOS ENTRAN AL PROMPT, Y NO PARA QUE SE CITEN.
  //
  // `contexto_qa` devuelve, además de los chunks, las entidades que casaron con
  // la pregunta y cuyo TEXTO no está capturado. Sin decírselo al modelo, la
  // respuesta salía afirmando «no consta información sobre proyectos de ley de
  // inteligencia artificial» mientras el propio sistema imprimía cuatro debajo.
  // Eso es un falso negativo, y en un buscador jurídico el falso negativo es el
  // fallo caro.
  //
  // No se pueden citar —no hay texto que citar— así que cualquier frase que
  // hablara de ellos se caería en `validarCitas`. Lo que se le pide es lo
  // contrario de escribir: que NO afirme que no existen.
  if (huecos.length > 0) {
    partes.push(
      "## Registros que casaron con la pregunta y cuyo texto NO está capturado",
      "",
      huecos.map((h) => `- ${h}`).join("\n"),
      "",
      "De estos NO tienes el texto, así que no los describas y no los cites: no",
      "hay nada que citar. Pero **no afirmes que no existen** ni que «no consta",
      "nada» sobre el asunto. Lo correcto es decir que la evidencia CITABLE no",
      "cubre la pregunta.",
      "",
    );
  }

  partes.push(
    "## Pregunta",
    "",
    pregunta.trim(),
    "",
    "Responde solo con el objeto JSON del formato de salida.",
  );
  return partes.join("\n");
}

export interface EjecucionCli {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProveedorDeps {
  /** Se inyecta para poder probar esta capa sin invocar el CLI. */
  readonly ejecutar: (args: readonly string[], stdin: string) => Promise<EjecucionCli>;
}

/** Lanza `claude` de verdad. El único sitio del repo que lo hace. */
export const ejecutarClaude = (args: readonly string[], stdin: string): Promise<EjecucionCli> =>
  new Promise((resolve, reject) => {
    const hijo = spawn("claude", [...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const temporizador = setTimeout(() => {
      hijo.kill("SIGKILL");
      reject(new Error(`claude no respondió en ${TIMEOUT_MS / 1000} s`));
    }, TIMEOUT_MS);

    hijo.stdout.on("data", (d) => {
      stdout += d;
    });
    hijo.stderr.on("data", (d) => {
      stderr += d;
    });
    hijo.on("error", (e) => {
      clearTimeout(temporizador);
      reject(
        new Error(
          `no se pudo lanzar \`claude\`: ${e.message}. ` +
            "Instálalo (https://claude.com/claude-code) e inicia sesión con `claude`.",
        ),
      );
    });
    hijo.on("close", (code) => {
      clearTimeout(temporizador);
      resolve({ code, stdout, stderr });
    });

    // Un stdin que se rompe NO puede tumbar el proceso entero. Si `claude` sale
    // antes de leerlo —sesión caducada, flag no reconocido—, escribir en su
    // tubería emite EPIPE; sin este listener, Node lo eleva a excepción no
    // capturada y muere el comando, perdiendo el `stderr` que EXPLICA por qué
    // salió. Con él, el error se ignora aquí y gana la carrera el `close`, que
    // sí trae el diagnóstico.
    hijo.stdin.on("error", () => {});
    hijo.stdin.end(stdin);
  });

export const depsPorDefecto: ProveedorDeps = { ejecutar: ejecutarClaude };

/**
 * Lee el sobre de `--output-format json` y devuelve el texto del modelo.
 *
 * Puro, y con una guarda que no es de adorno: el CLI devuelve `is_error` en un
 * JSON con `HTTP 200` equivalente —código de salida 0— cuando el turno acabó
 * mal. Tratar eso como una respuesta vacía haría que un fallo de sesión se
 * leyera como «no consta en el corpus», que es la peor confusión posible aquí.
 */
export function leerSobre(stdout: string): string {
  let sobre: unknown;
  try {
    sobre = JSON.parse(stdout);
  } catch {
    throw new Error(`claude no devolvió JSON: ${stdout.slice(0, 300)}`);
  }
  const s = sobre as { is_error?: boolean; subtype?: string; result?: unknown };
  if (s.is_error === true) {
    throw new Error(
      `claude devolvió error (${s.subtype ?? "sin subtipo"}): ${String(s.result ?? "")}`.slice(
        0,
        400,
      ),
    );
  }
  if (typeof s.result !== "string") {
    throw new Error("la respuesta de claude no trae `result` de texto");
  }
  return s.result;
}

export interface OpcionesPregunta {
  readonly deps?: ProveedorDeps;
  readonly modelo?: string;
  /** Entidades que casaron y no tienen texto. Ver `construirPrompt`. */
  readonly huecos?: readonly string[];
}

/** Pregunta al modelo. Devuelve el texto CRUDO: no valida nada. */
export async function preguntar(
  pregunta: string,
  chunks: readonly Chunk[],
  opciones: OpcionesPregunta = {},
): Promise<string> {
  const deps = opciones.deps ?? depsPorDefecto;
  if (chunks.length === 0) {
    // Sin evidencia no se pregunta. Llamar al modelo con las manos vacías es
    // pedirle que conteste de memoria, y de memoria es de donde salen las
    // citas fantasma.
    throw new Error("no hay evidencia que citar: no se llama al modelo");
  }
  const { code, stdout, stderr } = await deps.ejecutar(
    argumentos(opciones.modelo ?? MODELO),
    construirPrompt(pregunta, chunks, opciones.huecos ?? []),
  );
  if (code !== 0) {
    throw new Error(`claude salió con código ${code}: ${stderr.slice(0, 300)}`);
  }
  return leerSobre(stdout);
}
