/**
 * R2 — citas por construcción: **la frase sin cita válida se elimina.**
 *
 * El plan lo formula como post-validación: cada cita que el modelo produzca
 * tiene que resolver a un `chunk_id` que EXISTE, y la frase que no la tenga no
 * se publica. No se marca con un aviso, no se degrada a «según nuestra
 * información»: se quita.
 *
 * Esto es lógica pura y no necesita ninguna API. Se puede escribir, y se puede
 * probar, antes de que exista una sola llamada al modelo — que es exactamente
 * cuando conviene tenerlo escrito, porque después la tentación es aceptar la
 * respuesta bonita que llegó sin cita.
 *
 * ## El fallo que esto ataca
 *
 * Un modelo con contexto recuperado produce, casi siempre, una respuesta
 * verosímil. El problema no son las respuestas obviamente falsas: son las
 * frases correctas en el tono, plausibles en el fondo y **sin nada detrás**.
 * Mezcladas con frases bien citadas resultan indistinguibles para el lector.
 */

export interface FraseCitada {
  readonly texto: string;
  /** Ids de chunk que el modelo declara como respaldo. */
  readonly citas: readonly string[];
}

export interface ResultadoValidacion {
  /** Lo que se puede publicar: solo frases con al menos una cita válida. */
  readonly publicables: readonly FraseCitada[];
  /** Lo que se cae, con el motivo. Se conserva: es la métrica de calidad. */
  readonly eliminadas: readonly { readonly frase: FraseCitada; readonly motivo: string }[];
  /** Citas que apuntaban a un chunk inexistente. La señal de alucinación. */
  readonly citasFantasma: readonly string[];
  /** Proporción de frases que sobrevivieron. Baja = el retrieval no sirve. */
  readonly tasaSupervivencia: number;
}

/**
 * Valida las citas de una respuesta contra los chunks que se le dieron.
 *
 * `chunksDisponibles` son los que ENTRARON en el contexto, no todo el corpus:
 * una cita a un chunk que existe en la base pero no se le pasó al modelo es
 * igual de sospechosa — significa que lo produjo de memoria, no de la evidencia.
 */
export function validarCitas(
  frases: readonly FraseCitada[],
  chunksDisponibles: readonly string[],
): ResultadoValidacion {
  const validos = new Set(chunksDisponibles);
  const publicables: FraseCitada[] = [];
  const eliminadas: { frase: FraseCitada; motivo: string }[] = [];
  const fantasma = new Set<string>();

  for (const f of frases) {
    const buenas = f.citas.filter((c) => validos.has(c));
    for (const c of f.citas) if (!validos.has(c)) fantasma.add(c);

    if (f.citas.length === 0) {
      eliminadas.push({ frase: f, motivo: "sin cita" });
      continue;
    }
    if (buenas.length === 0) {
      eliminadas.push({
        frase: f,
        motivo: `todas las citas apuntan a chunks inexistentes: ${f.citas.join(", ")}`,
      });
      continue;
    }
    // Se conservan SOLO las citas válidas: publicar una cita fantasma junto a
    // una buena le da al lector una referencia que no puede comprobar.
    publicables.push({ texto: f.texto, citas: buenas });
  }

  return {
    publicables,
    eliminadas,
    citasFantasma: [...fantasma],
    tasaSupervivencia: frases.length === 0 ? 1 : publicables.length / frases.length,
  };
}

/**
 * ¿Se puede publicar la respuesta entera?
 *
 * Una respuesta a la que se le cayó la mitad de las frases no es «una respuesta
 * un poco peor»: es una respuesta con agujeros, y los agujeros no se ven. Por
 * debajo del umbral, lo honesto es no responder y decir que no hay evidencia
 * suficiente.
 */
export function puedePublicarse(r: ResultadoValidacion, umbral = 0.8): boolean {
  return r.publicables.length > 0 && r.tasaSupervivencia >= umbral;
}
