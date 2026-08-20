/**
 * Q&A con citas, de punta a punta y desde la terminal.
 *
 * La cadena estaba escrita entera y sin unir: `contexto_qa` recupera, `qa.ts`
 * valida y `citas.ts` decide qué se publica — y no había nada que llamara a las
 * tres en orden. Esto es esa llamada.
 *
 * El contexto se pide por `web/src/lib/consultas.ts` y NO por
 * `recuperarContexto()` directamente. No es un rodeo: esa es la frontera donde
 * se aplica la política de egreso, y una puerta nueva que la esquive es
 * exactamente el fallo que `consultas.ts` documenta en su cabecera.
 *
 * **Y eso cierra un ciclo entre paquetes, dicho de frente:** `web` importa de
 * `collectors` (la política de egreso y el agrupador de contexto) y este fichero
 * importa de `web`. Se acepta a conciencia y con el precio anotado: romperlo
 * bien es mover `consultas.ts` a un paquete compartido, y hacerlo mal —duplicar
 * la frontera de egreso para no importar de `web`— es construir la puerta
 * número quince. Entre un ciclo que Node y vitest resuelven sin problema y dos
 * copias de la política, el ciclo es el mal menor. Queda escrito para que sea
 * una decisión y no un descuido.
 *
 * Uso:
 *   pnpm qa "¿Qué dice la ley sobre atención en salud mental de menores?"
 *   pnpm qa --json "…"      # para el arnés del gold set
 */

import { contextoQa } from "../../../web/src/lib/consultas.ts";
import { embeberConsulta } from "../../../web/src/lib/embedding-consulta.ts";
import { consultanteDesdeEntorno } from "../../../web/src/lib/supabase.ts";
import { puedePublicarse } from "./citas.ts";
import { preguntar } from "./proveedor-claude-code.ts";
import {
  procesarRespuesta,
  type Referencia,
  RespuestaIlegible,
  type ResultadoTextualidad,
} from "./qa.ts";

/** Umbral de supervivencia de frases por debajo del cual no se publica. */
const UMBRAL = 0.8;

export interface ResultadoQaCli {
  readonly pregunta: string;
  readonly publicable: boolean;
  readonly texto: string;
  readonly referencias: readonly Referencia[];
  readonly huecos: readonly string[];
  readonly citasFantasma: readonly string[];
  readonly noLiterales: ResultadoTextualidad["noLiterales"];
  readonly tasaSupervivencia: number;
  /**
   * Cuántas frases sobrevivieron. Va aparte de la tasa porque las dos cosas se
   * confunden justo en el caso interesante: con CERO frases la tasa es 1 —no
   * se cayó ninguna— y anunciar «sobrevivió el 100 %» junto a «no hay evidencia
   * suficiente» es una contradicción en la cara del usuario.
   */
  readonly frasesPublicables: number;
  readonly chunksEnContexto: number;
  readonly sinSemantica: string | null;
  readonly advertencia: string | null;
  /**
   * Por qué no se pudo LEER la respuesta del modelo, si es que pasó.
   *
   * `null` significa que se leyó bien —aunque no publicara nada—. Un texto aquí
   * es un FALLO del sistema, y quien lo imprima no puede decir ni una palabra
   * sobre el corpus: no se llegó a saber qué decía el modelo. Es la distinción
   * que se perdía cuando `parsearRespuesta` devolvía la lista vacía en los
   * cuatro casos.
   */
  readonly ilegible: string | null;
}

export async function responder(pregunta: string): Promise<ResultadoQaCli> {
  const { vector, motivo } = await embeberConsulta(pregunta);
  const ctx = await contextoQa(consultanteDesdeEntorno(), pregunta, "api_bloque", {
    embedding: vector,
  });

  const base = {
    pregunta,
    huecos: ctx.huecos.map((h) => `${h.entidad} (${h.origen}) — ${h.urlFuente}`),
    chunksEnContexto: ctx.chunks.length,
    sinSemantica: motivo,
    advertencia: ctx.advertencia,
  };

  // Sin evidencia NO se llama al modelo. Preguntarle con las manos vacías es
  // pedirle que conteste de memoria, y de memoria salen las citas fantasma.
  if (ctx.chunks.length === 0) {
    return {
      ...base,
      publicable: false,
      texto: "",
      referencias: [],
      citasFantasma: [],
      noLiterales: [],
      tasaSupervivencia: 0,
      frasesPublicables: 0,
      ilegible: null,
    };
  }

  const bruto = await preguntar(pregunta, ctx.chunks, { huecos: base.huecos });

  let r: ReturnType<typeof procesarRespuesta>;
  try {
    r = procesarRespuesta(bruto, ctx.chunks);
  } catch (e) {
    if (!(e instanceof RespuestaIlegible)) throw e;
    // Se devuelve un resultado, no se lanza: quien llama tiene que poder
    // distinguir «el modelo no dijo nada citable» de «no se supo qué dijo», y
    // para eso necesita el motivo, no una excepción que se traga arriba.
    return {
      ...base,
      publicable: false,
      texto: "",
      referencias: [],
      citasFantasma: [],
      noLiterales: [],
      tasaSupervivencia: 0,
      frasesPublicables: 0,
      ilegible: e.motivo,
    };
  }

  return {
    ...base,
    publicable: puedePublicarse(r.validacion, UMBRAL),
    texto: r.texto,
    referencias: r.referencias,
    citasFantasma: r.validacion.citasFantasma,
    noLiterales: r.noLiterales,
    tasaSupervivencia: r.validacion.tasaSupervivencia,
    frasesPublicables: r.validacion.publicables.length,
    ilegible: null,
  };
}

function imprimir(r: ResultadoQaCli): void {
  if (r.sinSemantica) {
    console.log(`· solo búsqueda léxica: ${r.sinSemantica}`);
  }
  console.log(`· ${r.chunksEnContexto} chunk(s) en el contexto`);

  if (r.ilegible !== null) {
    // PRIMERO, y sin decir nada del corpus. Aquí no se llegó a saber qué
    // contestó el modelo, así que cualquier frase sobre lo capturado sería
    // inventada — el fallo se comunicaría como un hecho sobre los datos.
    console.log(
      `\n⚠ FALLO: no se pudo leer la respuesta del modelo (${r.ilegible}).\n` +
        "Esto NO dice nada sobre el corpus. Vuelve a intentarlo; si se repite,\n" +
        "el proveedor está devolviendo algo que no cumple el contrato de salida.",
    );
  } else if (r.chunksEnContexto === 0) {
    console.log(
      "\nNo consta evidencia citable para esta pregunta en el corpus.\n" +
        "Eso significa que no está en lo capturado, NO que no exista.",
    );
  } else if (r.frasesPublicables === 0) {
    // El modelo no escribió NADA que pudiera citar. No es lo mismo que una
    // respuesta a la que se le cayeron frases, y decir «sobrevivió el 100 %»
    // aquí —que es literalmente cierto: no se cayó ninguna de cero— sería
    // absurdo.
    console.log(
      "\nLa evidencia CITABLE del corpus no cubre esta pregunta.\n" +
        (r.huecos.length > 0
          ? "Sí casaron registros cuyo texto no está capturado; van listados abajo."
          : "Eso significa que no está en lo capturado, NO que no exista."),
    );
  } else if (!r.publicable) {
    console.log(
      `\nNo hay evidencia suficiente para responder.\n` +
        `Solo sobrevivió el ${(r.tasaSupervivencia * 100).toFixed(0)} % de las frases ` +
        `(umbral ${UMBRAL * 100} %). Una respuesta con agujeros no se publica: ` +
        "los agujeros no se ven.",
    );
  } else {
    console.log(`\n${r.texto}\n`);
    // Con URL y fecha de captura: el contrato de procedencia del proyecto vale
    // también —y sobre todo— para la lista de fuentes de una respuesta, que es
    // donde el lector va a comprobar.
    console.log("Fuentes:");
    for (const ref of r.referencias) {
      console.log(`  · ${ref.referencia}`);
      console.log(`    ${ref.urlFuente} · capturado ${ref.capturedAt.slice(0, 10)}`);
    }
  }

  if (r.huecos.length > 0) {
    console.log("\nEntidades relevantes SIN texto capturado (no se pudieron citar):");
    for (const h of r.huecos) console.log(`  · ${h}`);
  }
  if (r.citasFantasma.length > 0) {
    console.log(`\n⚠ citas a chunks inexistentes: ${r.citasFantasma.join(", ")}`);
  }
  // Los dos motivos se imprimen por separado: «la fuente no lo dice» es una
  // acusación de fabricación, y «la cita es demasiado corta» no lo es.
  const falsas = r.noLiterales.filter((n) => n.motivo === "no_literal");
  const cortas = r.noLiterales.filter((n) => n.motivo === "demasiado_corta");
  if (falsas.length > 0) {
    console.log(`\n⚠ ${falsas.length} cita(s) entrecomillada(s) que la fuente NO dice:`);
    for (const n of falsas.slice(0, 5)) {
      console.log(`  · ${n.chunkId}: «${n.citaTextual.slice(0, 90)}»`);
    }
  }
  if (cortas.length > 0) {
    console.log(
      `\n· ${cortas.length} cita(s) literales pero demasiado cortas para identificar nada; descartadas.`,
    );
  }
  console.log("\nEsto no es asesoría jurídica. Comprueba cada cita en su fuente oficial.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const pregunta = args
    .filter((a) => !a.startsWith("--"))
    .join(" ")
    .trim();

  if (pregunta === "") {
    console.error('uso: pnpm qa "tu pregunta" [--json]');
    process.exitCode = 1;
    return;
  }

  const r = await responder(pregunta);
  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    imprimir(r);
  }
  if (!r.publicable) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
