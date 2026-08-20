/**
 * Votaciones nominales: del texto de la gaceta a un registro con procedencia.
 *
 * El OCR (Mistral) es una llamada con clave; **este módulo no la hace**. Recibe
 * texto y lo interpreta, que es donde están los errores que importan.
 *
 * ## Por qué el OCR no puede ser la última palabra
 *
 * Un OCR sobre una tabla de votación confunde columnas, parte apellidos y lee
 * un «SÍ» borroso como «NO». Y no falla: devuelve una tabla perfectamente
 * formada con el voto de alguien cambiado. Publicar eso es atribuirle a una
 * persona identificada un voto que no emitió — el error más caro que este
 * proyecto puede cometer, porque tiene consecuencias para un tercero y no para
 * quien lo comete.
 *
 * De ahí las tres reglas de abajo, y la más importante es la tercera.
 */

/** Sentidos de voto que una gaceta registra. */
export const SENTIDOS = ["si", "no", "abstencion", "ausente", "impedido"] as const;
export type Sentido = (typeof SENTIDOS)[number];

export interface VotoIndividual {
  readonly congresista: string;
  readonly sentido: Sentido;
  /** Texto crudo del que salió. Se conserva: es la prueba frente al OCR. */
  readonly crudo: string;
}

export interface Votacion {
  readonly votos: readonly VotoIndividual[];
  /** Totales que DECLARA el acta. */
  readonly totalesDeclarados: Readonly<Partial<Record<Sentido, number>>> | null;
  readonly anomalias: readonly Anomalia[];
  /**
   * `true` si los votos individuales se pueden publicar.
   *
   * Falso cuando los totales no cuadran: en ese caso el acta y la lectura
   * discrepan, y no se sabe cuál está mal. Se publica el total declarado —que
   * es lo que dice el documento oficial— y NUNCA los individuales.
   */
  readonly publicable: boolean;
}

export interface Anomalia {
  readonly clase: "total-no-cuadra" | "sentido-ilegible" | "nombre-vacio" | "duplicado";
  readonly detalle: string;
}

const NORMALIZA: ReadonlyArray<readonly [RegExp, Sentido]> = [
  [/^s[ií]$/i, "si"],
  [/^no$/i, "no"],
  [/^abstenci[oó]n$|^abstiene$/i, "abstencion"],
  [/^ausente$|^no vot[oó]$/i, "ausente"],
  [/^impedid[oa]$|^impedimento$/i, "impedido"],
];

/**
 * Interpreta un sentido de voto. `null` si no se reconoce.
 *
 * **No se adivina.** Un «S1» que el OCR leyó mal no se convierte en «SÍ»: se
 * declara ilegible. Adivinar aquí es inventarle un voto a alguien.
 */
export function normalizarSentido(s: string): Sentido | null {
  const t = s.trim();
  for (const [re, v] of NORMALIZA) if (re.test(t)) return v;
  return null;
}

/**
 * Interpreta el bloque de votos.
 *
 * Formato esperado por línea: `APELLIDO NOMBRE .... SENTIDO`, que es como lo
 * imprimen las gacetas. Se acepta cualquier separador de puntos o espacios.
 */
export function parseVotos(texto: string): {
  votos: VotoIndividual[];
  anomalias: Anomalia[];
} {
  const votos: VotoIndividual[] = [];
  const anomalias: Anomalia[] = [];
  const vistos = new Set<string>();

  for (const linea of texto.split("\n")) {
    const l = linea.trim();
    if (l === "") continue;

    // El último token se captura SIN restringir a letras. Con `[A-Za-z]+`, una
    // línea cuyo sentido el OCR leyó como «S1» no casaba y se descartaba EN
    // SILENCIO — que es exactamente lo que este módulo existe para impedir. Lo
    // cazó su propio test.
    const m = /^(.+?)[\s.]{2,}(\S+)\s*$/.exec(l);
    if (!m) continue;

    const nombre = (m[1] ?? "").replace(/[.\s]+$/, "").trim();
    const bruto = (m[2] ?? "").trim();

    if (nombre === "") {
      anomalias.push({ clase: "nombre-vacio", detalle: `línea sin nombre: ${JSON.stringify(l)}` });
      continue;
    }

    const sentido = normalizarSentido(bruto);
    if (!sentido) {
      // NO se adivina: atribuir un voto mal leído es inventárselo.
      anomalias.push({
        clase: "sentido-ilegible",
        detalle: `${nombre}: ${JSON.stringify(bruto)} no es un sentido reconocible`,
      });
      continue;
    }

    const clave = nombre.toUpperCase();
    if (vistos.has(clave)) {
      anomalias.push({ clase: "duplicado", detalle: `${nombre} aparece dos veces` });
    }
    vistos.add(clave);

    votos.push({ congresista: nombre, sentido, crudo: l });
  }

  return { votos, anomalias };
}

/**
 * Contrasta lo leído contra los totales que declara el acta.
 *
 * **ESTA ES LA REGLA QUE SOSTIENE EL MÓDULO.** El acta imprime sus propios
 * totales; si la suma de lo que leyó el OCR no coincide, algo se leyó mal — y
 * no se sabe QUÉ. En ese caso los votos individuales **no se publican**: se
 * publica el total del acta, que es lo que dice el documento oficial, y los
 * individuales van a revisión humana.
 *
 * Es preferible a publicar 106 votos de los que 105 son correctos, porque el
 * incorrecto le atribuye a una persona algo que no hizo y nadie sabe cuál es.
 */
export function contrastarTotales(
  votos: readonly VotoIndividual[],
  declarados: Readonly<Partial<Record<Sentido, number>>> | null,
): { publicable: boolean; anomalias: Anomalia[] } {
  if (!declarados) {
    // Sin totales que contrastar no hay forma de detectar un error de lectura.
    return {
      publicable: false,
      anomalias: [
        {
          clase: "total-no-cuadra",
          detalle:
            "el acta no declara totales: sin contraste no se puede descartar un " +
            "error de OCR, y los votos individuales no se publican",
        },
      ],
    };
  }

  const contados: Partial<Record<Sentido, number>> = {};
  for (const v of votos) contados[v.sentido] = (contados[v.sentido] ?? 0) + 1;

  const anomalias: Anomalia[] = [];
  for (const s of SENTIDOS) {
    const d = declarados[s];
    if (d === undefined) continue;
    const c = contados[s] ?? 0;
    if (c !== d) {
      anomalias.push({
        clase: "total-no-cuadra",
        detalle: `${s}: el acta declara ${d} y se leyeron ${c}`,
      });
    }
  }

  return { publicable: anomalias.length === 0, anomalias };
}

/** Interpreta una votación completa. */
export function parseVotacion(
  texto: string,
  declarados: Readonly<Partial<Record<Sentido, number>>> | null,
): Votacion {
  const { votos, anomalias } = parseVotos(texto);
  const { publicable, anomalias: aTot } = contrastarTotales(votos, declarados);
  return {
    votos,
    totalesDeclarados: declarados,
    anomalias: [...anomalias, ...aTot],
    // Un sentido ilegible también bloquea: significa que alguien votó y no
    // sabemos qué, así que la lista está incompleta aunque los totales cuadren.
    publicable: publicable && anomalias.length === 0,
  };
}
