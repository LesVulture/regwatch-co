/**
 * Crosswalk Senado ↔ Cámara.
 *
 * Un borrador del plan daba esto por resuelto: «lo resuelven las fuentes
 * mismas, cada registro publica el número de la otra cámara». **No es cierto**,
 * y es la corrección más cara de toda la auditoría.
 *
 * Medido contra la API del Senado el 2026-08-19:
 *
 * | Legislatura        | Filas | Con `numero_camara` | Variantes de formato |
 * |--------------------|-------|---------------------|----------------------|
 * | 2024-2025 (cerrada)|   471 | 224 = **47,6 %**    | **7**                |
 * | 2026-2027 (en curso)| 194  |   3 = 1,5 %         | 1                    |
 *
 * La lectura correcta es la de la legislatura cerrada: **más de la mitad de
 * los proyectos no declara su contraparte**, ni siquiera al final del trámite.
 * La cifra de la legislatura en curso es baja por una razón distinta y
 * esperable —los proyectos aún no han cruzado de cámara—, así que citarla
 * como si midiera lo mismo sería exagerar el hallazgo.
 *
 * Y hay un problema de modelado que ningún informe mencionó: la acumulación.
 * Un proyecto puede absorber a otros, y el campo entonces trae varios números
 * en una sola cadena, con tres grafías distintas de la misma palabra
 * (`Acum`, `ACUM`, `Acumulado`) y separadores inconsistentes. **El crosswalk
 * no es 1:1, es 1:N.** Un `JOIN` sobre este campo no funciona.
 */

/** Un número de proyecto normalizado a su forma canónica. */
export interface NumeroProyecto {
  /** Consecutivo dentro de la legislatura, sin ceros a la izquierda. */
  readonly numero: number;
  /** Año de dos dígitos tal como lo publica la fuente. */
  readonly anio: string;
  /** Forma canónica `NNN/AA`, para comparar. */
  readonly canonico: string;
  /** El texto original, que se conserva siempre: es la evidencia. */
  readonly original: string;
}

export interface CrosswalkParse {
  /** El número principal. `null` si el campo venía vacío o ilegible. */
  readonly principal: NumeroProyecto | null;
  /** Proyectos acumulados a este. Vacío en el caso normal. */
  readonly acumulados: readonly NumeroProyecto[];
  /**
   * `true` si el campo traía algo que no se pudo interpretar. Nunca se
   * descarta en silencio: un campo ilegible es un dato para la cuarentena,
   * no un `null` cualquiera.
   */
  readonly ilegible: boolean;
  /**
   * Grupos de dígitos del crudo que el parser NO consumió.
   *
   * Existe por un caso real: `339/23 ACUM 340,341,344/23` nombra CUATRO
   * proyectos, pero `340` y `341` van sin `/año` y el regex —que exige el
   * año— solo casaba `339/23` y `344/23`. El resultado era «2 proyectos»
   * cuando el campo dice cuatro: **una acumulación 1:N contada de menos, en
   * silencio**, que es justo la clase de fallo que este módulo existe para
   * evitar.
   *
   * NO se resuelve infiriendo que `340` es `340/23`. Compartir el año es una
   * convención tipográfica, y deducir identidades por convención es lo mismo
   * que emparejar por parecido: si se acierta, no se sabe; si se falla,
   * tampoco. Se DECLARA lo que quedó sin interpretar y va a revisión humana.
   */
  readonly residuo: readonly string[];
  readonly raw: string;
}

/**
 * `001/26`, `211/2026`, `1/26`… Captura número y año en cualquier grafía.
 *
 * El orden de la alternancia del año es deliberado y **no se puede invertir**:
 * con `(\d{2}|\d{4})` el motor prueba dos dígitos primero y `211/2026` sale
 * como año `20`, descartando el `26`. Un test lo cazó. Es la clase de fallo
 * que no lanza ningún error y corrompe cada emparejamiento de año largo.
 */
const NUM_RE = /(\d{1,4})\s*\/\s*(\d{4}|\d{2})/g;

/**
 * Las tres grafías medidas de la acumulación, más sus separadores. Se
 * enumeran a partir de datos reales, no de imaginación: cada variante de esta
 * lista salió de las 471 filas de la legislatura 2024-2025.
 */
const ACUM_RE = /\b(acum(?:ulado)?)\b/i;

function canonizar(numero: string, anio: string, original: string): NumeroProyecto {
  // El año a dos dígitos: `2026` y `26` son el mismo año en esta fuente.
  const anio2 = anio.length === 4 ? anio.slice(2) : anio;
  const n = Number.parseInt(numero, 10);
  return {
    numero: n,
    anio: anio2,
    // Tres dígitos con ceros a la izquierda, que es como lo publica el Senado.
    canonico: `${String(n).padStart(3, "0")}/${anio2}`,
    original,
  };
}

/**
 * Interpreta un campo `numero_senado` o `numero_camara`.
 *
 * Deliberadamente tolerante en la lectura y estricto en el resultado: acepta
 * las siete variantes medidas, pero marca `ilegible` cuando encuentra texto
 * que no sabe interpretar en vez de devolver un `null` que se confundiría con
 * un campo vacío.
 */
export function parseNumero(raw: string | null | undefined): CrosswalkParse {
  const texto = (raw ?? "").trim();

  if (!texto) {
    return { principal: null, acumulados: [], ilegible: false, residuo: [], raw: texto };
  }

  const matches = [...texto.matchAll(NUM_RE)];

  if (matches.length === 0) {
    // Hay contenido pero no se parece a un número de proyecto. Esto va a
    // cuarentena, no al vacío.
    return { principal: null, acumulados: [], ilegible: true, residuo: [], raw: texto };
  }

  // Qué dígitos del crudo quedaron FUERA de todo emparejamiento. Ver `residuo`.
  const cubierto = new Array<boolean>(texto.length).fill(false);
  for (const m of matches) {
    const i = m.index ?? 0;
    for (let k = i; k < i + m[0].length; k++) cubierto[k] = true;
  }
  const residuo: string[] = [];
  for (const d of texto.matchAll(/\d{1,4}/g)) {
    const i = d.index ?? 0;
    if (!cubierto[i]) residuo.push(d[0]);
  }

  const nums = matches.map((m) => canonizar(m[1] as string, m[2] as string, m[0]));
  const [primero, ...resto] = nums as [NumeroProyecto, ...NumeroProyecto[]];

  // Si hay más de un número, solo son acumulados cuando el campo lo dice.
  // Sin la palabra, varios números en un mismo campo son un dato que no
  // entendemos, y decirlo es mejor que inventar una relación.
  const declaraAcumulacion = ACUM_RE.test(texto);

  if (resto.length > 0 && !declaraAcumulacion) {
    return { principal: primero, acumulados: [], ilegible: true, residuo, raw: texto };
  }

  return { principal: primero, acumulados: resto, ilegible: false, residuo, raw: texto };
}

/** Resultado de intentar emparejar un proyecto con su contraparte. */
export type EstadoCrosswalk =
  /** La fuente declara la contraparte y es interpretable. */
  | "declarado"
  /** La fuente no dice nada. Es el caso mayoritario: 52,4 % en 2024-2025. */
  | "no_declarado"
  /** La fuente dice algo que no se pudo interpretar. Va a revisión humana. */
  | "ilegible"
  /** Declara varios por acumulación: relación 1:N, no 1:1. */
  | "acumulado";

export interface Crosswalk {
  readonly estado: EstadoCrosswalk;
  readonly propio: NumeroProyecto | null;
  readonly contraparte: NumeroProyecto | null;
  readonly acumulados: readonly NumeroProyecto[];
  /** Por qué quedó en este estado. Se guarda: es procedencia, no un log. */
  readonly motivo: string;
  /**
   * Dígitos del campo de contraparte que quedaron sin interpretar. Si no está
   * vacío, la clasificación es INCOMPLETA aunque el estado parezca bueno: hay
   * proyectos nombrados que no se contaron. Va a revisión humana.
   */
  readonly residuo: readonly string[];
}

/**
 * Clasifica el crosswalk de una fila.
 *
 * **No resuelve identidades por parecido.** Si la fuente no lo declara, el
 * resultado es `no_declarado` y ahí termina el trabajo automático: emparejar
 * por título o por autor fabricaría relaciones falsas entre proyectos
 * distintos, y publicar «el Senado y la Cámara se contradicen» cuando no es
 * cierto hace más daño que no haber cruzado nada.
 *
 * Lo que sigue es cola de adjudicación humana, y por eso el plan lo
 * presupuesta como work item propio.
 */
export function clasificarCrosswalk(
  numeroPropio: string | null | undefined,
  numeroContraparte: string | null | undefined,
): Crosswalk {
  const propio = parseNumero(numeroPropio);
  const otro = parseNumero(numeroContraparte);

  if (otro.ilegible) {
    return {
      estado: "ilegible",
      propio: propio.principal,
      contraparte: null,
      acumulados: [],
      motivo: `el campo de contraparte trae texto no interpretable: ${JSON.stringify(otro.raw)}`,
      residuo: otro.residuo,
    };
  }

  if (!otro.principal) {
    return {
      estado: "no_declarado",
      propio: propio.principal,
      contraparte: null,
      acumulados: [],
      motivo: "la fuente no publica el número de la otra cámara (52,4 % de los casos)",
      residuo: otro.residuo,
    };
  }

  if (otro.acumulados.length > 0) {
    return {
      estado: "acumulado",
      propio: propio.principal,
      contraparte: otro.principal,
      acumulados: otro.acumulados,
      motivo:
        `acumulación declarada: ${otro.acumulados.length + 1} proyectos en una relación 1:N` +
        (otro.residuo.length > 0
          ? ` — INCOMPLETA: ${otro.residuo.length} número(s) sin año en el crudo (${otro.residuo.join(", ")}) que NO se cuentan; el campo nombra más proyectos de los interpretados. Revisión humana.`
          : ""),
      residuo: otro.residuo,
    };
  }

  return {
    estado: "declarado",
    propio: propio.principal,
    contraparte: otro.principal,
    acumulados: [],
    motivo:
      "la fuente declara la contraparte y es interpretable" +
      (otro.residuo.length > 0
        ? ` — pero quedaron dígitos sin interpretar (${otro.residuo.join(", ")}). Revisión humana.`
        : ""),
    residuo: otro.residuo,
  };
}
