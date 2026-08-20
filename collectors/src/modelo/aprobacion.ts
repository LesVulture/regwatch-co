/**
 * Indicador de probabilidad de aprobación (Fase 6).
 *
 * Dos regresiones logísticas encadenadas con factores explicables y **tasa base
 * publicada** — el patrón de GovTrack. Lo importante de ese patrón no es el
 * modelo: es que la tasa base se publique, porque sin ella un «32 % de
 * probabilidad» no significa nada para quien lo lee.
 *
 * ## La trampa que casi se cuela, medida el 2026-08-20
 *
 * De los 1.120 proyectos de las tres legislaturas cerradas, **278 llegaron a
 * ley y los 278 tienen `numero_camara`**. De los 842 que no llegaron, solo el
 * 31 % lo tiene.
 *
 * Como predictor eso parece oro y es **fuga del objetivo**: un proyecto llega a
 * ley solo si pasó por las dos cámaras, así que tener número de Cámara es una
 * consecuencia de lo que se quiere predecir, no una causa. Un modelo que la use
 * saca un AUC magnífico y no sirve para nada — porque el día que se quiere
 * predecir, el dato todavía no existe.
 *
 * Por eso este módulo no acepta cualquier variable: **solo las conocidas en el
 * momento de la radicación**, y la lista es explícita.
 */

/**
 * Variables admisibles: las que existen cuando el proyecto se radica.
 *
 * Es una lista blanca, y por el mismo motivo que la de egreso: con lista negra,
 * una variable nueva entraría por defecto y la fuga volvería sin avisar.
 */
export const FACTORES_ADMISIBLES = [
  /** Cámara donde se radica. Conocido el día 1. */
  "camara_origen",
  /** Comisión a la que se reparte. Conocido el día 1. */
  "comision",
  /** El autor es del Gobierno (ministerio) o no. Conocido el día 1. */
  "autor_gobierno",
  /** Número de autores que lo firman. Conocido el día 1. */
  "num_autores",
  /** Si es acto legislativo (reforma constitucional) o ley ordinaria. */
  "es_acto_legislativo",
  /** Mes de la legislatura en que se radica: lo tardío tiene menos recorrido. */
  "mes_legislatura",
] as const;

export type FactorAdmisible = (typeof FACTORES_ADMISIBLES)[number];

/**
 * Variables PROHIBIDAS, con el motivo escrito.
 *
 * Están enumeradas —en vez de simplemente ausentes— porque la lista es la
 * documentación del error: quien vea `numero_camara` en los datos y quiera
 * usarla encuentra aquí por qué no.
 */
export const FACTORES_CON_FUGA: Readonly<Record<string, string>> = {
  numero_camara:
    "FUGA: el 100 % de las 278 leyes lo tiene y solo el 31 % de las 842 que no " +
    "llegaron. Un proyecto tiene número de Cámara PORQUE cruzó, no al revés",
  estado: "FUGA: es el objetivo disfrazado. `estado='ley'` es literalmente lo que se predice",
  crosswalk: "FUGA: se deriva de numero_camara, así que arrastra el mismo problema",
  ultimo_envio: "FUGA: posterior a la radicación por definición",
  fecha_sancion: "FUGA: solo existe si el proyecto YA fue sancionado",
};

/** Error con el motivo delante, no un booleano. */
export class FactorConFugaError extends Error {
  constructor(factor: string, motivo: string) {
    super(`«${factor}» no se puede usar como predictor. ${motivo}.`);
    this.name = "FactorConFugaError";
  }
}

/**
 * Valida un conjunto de factores antes de entrenar.
 *
 * Lanza. No devuelve una advertencia que alguien pueda ignorar: un modelo
 * entrenado con fuga es peor que no tener modelo, porque parece funcionar.
 */
export function validarFactores(factores: readonly string[]): void {
  for (const f of factores) {
    const motivo = FACTORES_CON_FUGA[f];
    if (motivo) throw new FactorConFugaError(f, motivo);
    if (!(FACTORES_ADMISIBLES as readonly string[]).includes(f)) {
      throw new Error(
        `«${f}» no está en FACTORES_ADMISIBLES. Si es conocido en la radicación, ` +
          "añádelo ahí explícitamente; si no lo es, no puede predecir nada.",
      );
    }
  }
}

/**
 * Tasa base, con su denominador declarado.
 *
 * **Publicarla es medio patrón GovTrack**: sin ella, «32 % de probabilidad» no
 * le dice nada a quien lo lee. Y declarar el DENOMINADOR es la otra mitad,
 * porque una tasa base con el denominador equivocado es una cifra inventada con
 * aspecto de medición.
 */
export interface TasaBase {
  readonly leyes: number;
  readonly total: number;
  readonly tasa: number;
  /** Qué universo se contó. Es la parte que hace la cifra interpretable. */
  readonly denominador: string;
  /** Sesgo conocido del denominador. Se publica junto a la tasa. */
  readonly sesgo: string | null;
}

/**
 * Calcula la tasa base sobre legislaturas CERRADAS.
 *
 * Solo cerradas: una legislatura abierta tiene proyectos en curso que todavía
 * pueden llegar a ley, y contarlos como fracasos hunde la tasa. Medido: con las
 * cinco legislaturas sale 18,06 %; con las tres cerradas, 24,82 %.
 */
export function tasaBase(
  proyectos: readonly { legislatura: string; esLey: boolean }[],
  legislaturasCerradas: readonly string[],
  denominador: string,
  sesgo: string | null,
): TasaBase {
  const sub = proyectos.filter((p) => legislaturasCerradas.includes(p.legislatura));
  if (sub.length === 0) {
    throw new Error("sin proyectos de legislaturas cerradas: no hay tasa base que calcular");
  }
  const leyes = sub.filter((p) => p.esLey).length;
  return { leyes, total: sub.length, tasa: leyes / sub.length, denominador, sesgo };
}

/** Sigmoide. */
export function sigmoide(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export interface ModeloLogistico {
  readonly intercepto: number;
  readonly pesos: Readonly<Record<string, number>>;
}

/**
 * Probabilidad de una etapa, con la contribución de cada factor.
 *
 * Devuelve las contribuciones porque «factores explicables» no significa que el
 * modelo sea simple: significa que se pueda decir **por qué** dio lo que dio.
 */
export function predecirEtapa(
  m: ModeloLogistico,
  x: Readonly<Record<string, number>>,
): { readonly p: number; readonly contribuciones: Readonly<Record<string, number>> } {
  validarFactores(Object.keys(x));
  let z = m.intercepto;
  const contribuciones: Record<string, number> = {};
  for (const [k, v] of Object.entries(x)) {
    const w = m.pesos[k] ?? 0;
    contribuciones[k] = w * v;
    z += w * v;
  }
  return { p: sigmoide(z), contribuciones };
}

export interface Prediccion {
  readonly probabilidad: number;
  readonly pAprobadoOrigen: number;
  readonly pLeyDadoOrigen: number;
  readonly tasaBase: TasaBase;
  /** Cuántas veces la tasa base. Es lo que un lector entiende de verdad. */
  readonly vecesLaBase: number;
  readonly contribuciones: Readonly<Record<string, number>>;
  /** Lo que NO se sabe. Va con la predicción, no en una nota al pie. */
  readonly advertencias: readonly string[];
}

/**
 * Las dos etapas encadenadas: radicado → aprobado en origen → ley.
 *
 * Se encadena en vez de usar un modelo único porque los factores que mueven una
 * etapa no son los que mueven la otra, y un modelo único los promedia hasta
 * volverlos inexplicables — que es justo lo que no puede pasar aquí.
 */
export function predecir(
  etapa1: ModeloLogistico,
  etapa2: ModeloLogistico,
  x: Readonly<Record<string, number>>,
  base: TasaBase,
): Prediccion {
  const a = predecirEtapa(etapa1, x);
  const b = predecirEtapa(etapa2, x);
  const p = a.p * b.p;

  const advertencias = [
    `Tasa base: ${(base.tasa * 100).toFixed(2)} % (${base.leyes} de ${base.total}). ` +
      `Denominador: ${base.denominador}.`,
    "Esto es un indicador estadístico, NO una predicción sobre este proyecto en concreto.",
  ];
  if (base.sesgo) advertencias.push(`Sesgo conocido del denominador: ${base.sesgo}`);

  const contribuciones: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a.contribuciones), ...Object.keys(b.contribuciones)])) {
    contribuciones[k] = (a.contribuciones[k] ?? 0) + (b.contribuciones[k] ?? 0);
  }

  return {
    probabilidad: p,
    pAprobadoOrigen: a.p,
    pLeyDadoOrigen: b.p,
    tasaBase: base,
    vecesLaBase: base.tasa === 0 ? Number.NaN : p / base.tasa,
    contribuciones,
    advertencias,
  };
}
