/**
 * Arnés del gold set: pasa las 18 preguntas por el Q&A y deja la corrida
 * escrita.
 *
 * ## Lo que este arnés SÍ decide, y lo que no
 *
 * Decide, solo, las propiedades que son mecánicas y que ninguna persona debería
 * tener que revisar a mano:
 *
 * - **citas fantasma**: cero. Una cita a un chunk que no se le dio al modelo.
 * - **citas no literales**: cero. Un entrecomillado que la fuente no dice.
 * - **hablar sin evidencia**: si el contexto vino vacío, la respuesta tiene que
 *   ser «no consta». Publicar algo ahí es fabricar.
 *
 * **NO decide si la respuesta es correcta.** Eso es `correctness`, y R7 exige
 * medirlo por separado de `groundedness` precisamente porque un juez automático
 * puntúa el tono. La corrida se escribe en un artefacto para que una persona la
 * lea. Un arnés que devolviera «17/18 ✅» sin que nadie hubiera leído las
 * respuestas sería el claim vacío que este repo prohíbe.
 *
 * Uso:
 *   pnpm gold:run              # todas
 *   pnpm gold:run -- G003 G007 # solo esas
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";
import { responder } from "../collectors/src/rag/run-qa.ts";

interface Pregunta {
  id: string;
  tipo: string;
  volatil: boolean;
  pregunta: string;
  respuesta_esperada: string;
  ancla?: string;
}

/** Tipos en los que la respuesta correcta es negarse o corregir la premisa. */
const DEBE_NEGARSE = new Set(["negacion", "premisa_falsa", "rechazo"]);

export interface FilaGold {
  readonly id: string;
  readonly tipo: string;
  readonly volatil: boolean;
  readonly pregunta: string;
  readonly respuesta_esperada: string;
  readonly publicable: boolean;
  readonly texto: string;
  /**
   * Las fuentes citadas CON su procedencia. Sin url y fecha de captura, la
   * corrida no se puede auditar: no hay a dónde ir a comprobar la cita.
   */
  readonly referencias: readonly {
    readonly chunkId: string;
    readonly referencia: string;
    readonly urlFuente: string;
    readonly capturedAt: string;
  }[];
  readonly chunksEnContexto: number;
  /**
   * Por qué no se pudo LEER la respuesta del modelo, si es que pasó.
   *
   * Sin esta columna, «el modelo declinó» y «su salida no se pudo interpretar»
   * quedan idénticos en el artefacto —los dos con `frasesPublicables: 0`,
   * `tasaSupervivencia: 1` y `error: null`— y la corrida deja de ser auditable
   * justo donde más falta hace.
   */
  readonly ilegible: string | null;
  /**
   * Por qué NO hubo mitad semántica, si es que no la hubo.
   *
   * Sin esta columna, dos corridas del mismo gold set no son comparables: una
   * con Ollama y otra sin él recuperan cosas distintas, y la diferencia se
   * leería como una mejora o un empeoramiento del sistema.
   */
  readonly sinSemantica: string | null;
  /**
   * Entidades que casaron con la pregunta y cuyo texto NO está capturado.
   *
   * Se guarda porque es la diferencia entre «el sistema no supo» y «el corpus
   * no lo tiene», y sin esta columna las dos cosas se leen igual en la corrida.
   */
  readonly huecos: readonly string[];
  readonly citasFantasma: readonly string[];
  /** Citas entrecomilladas que la fuente NO dice. Es la métrica de fabricación. */
  readonly noLiterales: number;
  /** Citas literales pero demasiado cortas para identificar nada. No es fabricar. */
  readonly citasCortas: number;
  readonly tasaSupervivencia: number;
  readonly frasesPublicables: number;
  /** Fallos MECÁNICOS. Vacío no significa «respuesta correcta». */
  readonly fallosMecanicos: readonly string[];
  readonly error: string | null;
}

function revisarMecanica(p: Pregunta, r: Awaited<ReturnType<typeof responder>>): string[] {
  const fallos: string[] = [];
  if (r.citasFantasma.length > 0) {
    fallos.push(`cita a chunk inexistente: ${r.citasFantasma.join(", ")}`);
  }
  // Solo las `no_literal` son fabricación. Una cita LITERAL pero demasiado
  // corta se descarta por prudencia, y contarla aquí denunciaría al modelo por
  // decir algo que la fuente sí dice.
  const falsas = r.noLiterales.filter((n) => n.motivo === "no_literal");
  if (falsas.length > 0) {
    fallos.push(`${falsas.length} cita(s) entrecomillada(s) que la fuente no dice`);
  }
  // LAS DOS DE ABAJO SON INALCANZABLES HOY, Y SE QUEDAN A PROPÓSITO.
  //
  // `responder()` corta antes de llamar al modelo cuando no hay chunks y
  // devuelve `texto: ""`, así que «contexto vacío + texto» no puede darse. No
  // son código muerto por descuido: son la RED por si alguien quita ese corte
  // temprano —que es una optimización razonable de proponer— y el sistema
  // empieza a preguntar con las manos vacías. Que sean baratas y estén escritas
  // es lo que hace que ese cambio salga rojo en vez de salir plausible.
  if (r.chunksEnContexto === 0 && r.texto.trim() !== "") {
    fallos.push("respondió con el contexto vacío: eso es fabricar");
  }
  if (DEBE_NEGARSE.has(p.tipo) && r.publicable && r.chunksEnContexto === 0) {
    fallos.push(`tipo ${p.tipo} respondido sin ninguna evidencia`);
  }
  return fallos;
}

async function main(): Promise<void> {
  const soloIds = new Set(process.argv.slice(2).filter((a) => !a.startsWith("--")));
  const doc = parse(readFileSync(new URL("./preguntas.yaml", import.meta.url), "utf-8")) as {
    _meta: { version: number; fecha: string };
    preguntas: Pregunta[];
  };

  const preguntas = doc.preguntas.filter((p) => soloIds.size === 0 || soloIds.has(p.id));
  console.log(
    `gold set v${doc._meta.version} (${doc._meta.fecha}) · ${preguntas.length} pregunta(s)\n`,
  );

  const filas: FilaGold[] = [];
  for (const p of preguntas) {
    process.stdout.write(`${p.id} [${p.tipo}] … `);
    try {
      const r = await responder(p.pregunta);
      const fallos = revisarMecanica(p, r);
      const falsas = r.noLiterales.filter((n) => n.motivo === "no_literal");
      filas.push({
        id: p.id,
        tipo: p.tipo,
        volatil: p.volatil,
        pregunta: p.pregunta,
        respuesta_esperada: p.respuesta_esperada,
        publicable: r.publicable,
        texto: r.texto,
        referencias: r.referencias,
        chunksEnContexto: r.chunksEnContexto,
        ilegible: r.ilegible,
        sinSemantica: r.sinSemantica,
        huecos: r.huecos,
        citasFantasma: r.citasFantasma,
        noLiterales: falsas.length,
        citasCortas: r.noLiterales.length - falsas.length,
        tasaSupervivencia: r.tasaSupervivencia,
        frasesPublicables: r.frasesPublicables,
        fallosMecanicos: fallos,
        error: null,
      });
      const estado = r.ilegible !== null ? "ILEGIBLE" : r.publicable ? "respondió" : "no responde";
      console.log(
        `${estado} · ${r.chunksEnContexto} chunk(s) · ${r.huecos.length} hueco(s)` +
          (fallos.length > 0 ? ` · ⚠ ${fallos.length} fallo(s) mecánico(s)` : ""),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      filas.push({
        id: p.id,
        tipo: p.tipo,
        volatil: p.volatil,
        pregunta: p.pregunta,
        respuesta_esperada: p.respuesta_esperada,
        publicable: false,
        texto: "",
        referencias: [],
        chunksEnContexto: 0,
        ilegible: null,
        sinSemantica: null,
        huecos: [],
        citasFantasma: [],
        noLiterales: 0,
        citasCortas: 0,
        tasaSupervivencia: 0,
        frasesPublicables: 0,
        fallosMecanicos: [],
        error: msg,
      });
      console.log(`ERROR: ${msg.slice(0, 120)}`);
    }
  }

  mkdirSync("artefactos", { recursive: true });
  // El nombre lleva la fecha del GOLD SET, no la de la corrida — es lo que
  // permite comparar dos corridas de la misma versión. Pero una corrida FILTRADA
  // (`pnpm gold:run G001`) no es comparable con la completa y pisarla borraría
  // la única medición que vale: por eso las parciales llevan su propio nombre.
  const parcial = soloIds.size > 0;
  const ruta = parcial
    ? `artefactos/gold-run-${doc._meta.fecha}-parcial-${[...soloIds].sort().join("_")}.json`
    : `artefactos/gold-run-${doc._meta.fecha}.json`;
  writeFileSync(
    ruta,
    `${JSON.stringify(
      {
        _procedencia: {
          gold_version: doc._meta.version,
          corrido_con: "collectors/src/rag/run-qa.ts",
          preguntas_del_set: doc.preguntas.length,
          preguntas_corridas: filas.length,
          parcial,
          nota:
            "Los `fallosMecanicos` son lo ÚNICO evaluado automáticamente. La " +
            "corrección de cada respuesta la juzga una persona comparando `texto` " +
            "con `respuesta_esperada`.",
        },
        filas,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  const conFallos = filas.filter((f) => f.fallosMecanicos.length > 0);
  const conError = filas.filter((f) => f.error !== null);
  const ilegibles = filas.filter((f) => f.ilegible !== null);
  const respondidas = filas.filter((f) => f.publicable);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`respondidas       : ${respondidas.length}/${filas.length}`);
  console.log(`sin evidencia     : ${filas.filter((f) => f.chunksEnContexto === 0).length}`);
  console.log(`fallos mecánicos  : ${conFallos.length}`);
  // Aparte de los mecánicos a propósito: una salida ilegible no es el modelo
  // fabricando una cita, es el proveedor incumpliendo el contrato. Sumarlas
  // haría ilegible la única métrica que el arnés sí garantiza.
  console.log(`salidas ilegibles : ${ilegibles.length}`);
  console.log(`errores de corrida: ${conError.length}`);
  for (const f of conFallos) console.log(`  ⚠ ${f.id}: ${f.fallosMecanicos.join(" · ")}`);
  for (const f of ilegibles) console.log(`  ⚠ ${f.id}: ilegible — ${f.ilegible}`);
  console.log(`\nCorrida escrita en ${ruta}`);
  console.log(
    "La CORRECCIÓN de las respuestas no está evaluada aquí: léelas contra su\n" +
      "`respuesta_esperada`. Un verde de este arnés significa «no fabricó citas»,\n" +
      "NO «acertó».",
  );

  if (conFallos.length > 0 || conError.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
