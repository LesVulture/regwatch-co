/**
 * Secretaría del Senado (basedoc) — el foso del proyecto.
 *
 * Aquí vive la vigencia: qué norma modificó a cuál, desde cuándo y con qué
 * Diario Oficial. Es lo que separa a regwatch-co de una compilación más.
 *
 * ## Tres cosas medidas que hay que respetar o no funciona
 *
 * 1. **Solo responde por HTTP.** El 443 hace timeout (medido: 15 s, código 000).
 *    Forzar `https://` no es más seguro aquí: es no obtener nada.
 * 2. **ISO-8859-1.** Decodificar como UTF-8 revienta en el primer acento
 *    (medido: `0xed` en la posición 303 de la Ley 1616).
 * 3. **Las cajas de notas vienen VACÍAS en el HTML.** El HTML llama
 *    `insRow1()`…`insRowN()`; el contenido vive en `js/{slug}.js`, que las
 *    DEFINE. Un parser que solo lea el HTML se lleva la estructura sin un solo
 *    dato de vigencia — y no falla: devuelve una página perfectamente parseada
 *    y vacía.
 *
 * ## Y una restricción legal que es de diseño, no una nota al pie
 *
 * `secretariasenado.gov.co` lo edita **Avance Jurídico Casa Editorial S.A.S.**
 * (ISSN 1657-6241): editorial PRIVADA, no fuente estatal. La página estampa
 * «Derechos de autor reservados - Prohibida su reproducción».
 *
 * Por eso este módulo **no devuelve la prosa de la nota**. Devuelve el HECHO
 * que la nota permite averiguar —qué norma, qué artículo, qué Diario Oficial,
 * qué regla de vigencia— y el enlace para ir a leer la norma afectante. Los
 * hechos no son de nadie; la redacción del editor sí.
 *
 * **No hay ningún campo aquí que guarde el texto de la nota, y eso es
 * deliberado: la regla vive en el tipo, no en un comentario que alguien pueda
 * ignorar.** Ver PLAN-V2.md §5.2 y §15.
 */

export const BASE = "http://www.secretariasenado.gov.co/senado/basedoc";

/**
 * Tipos de afectación que el texto de las notas sabe nombrar. Es un subconjunto
 * de `tipo_afectacion` de la base: los que aparecen en las notas de basedoc.
 */
export type TipoLead =
  | "modifica"
  | "adiciona"
  | "deroga_expresa"
  | "subroga"
  | "sustituye"
  | "reglamenta"
  | "declara_inexequible_total"
  | "declara_inexequible_parcial"
  | "declara_exequible_condicionada"
  | "anula"
  | "suspende_provisionalmente";

/** Norma citada por la nota como causante del cambio. */
export interface NormaCitada {
  readonly tipo: string;
  readonly numero: string;
  readonly anio: string;
  /** Artículo concreto de la norma AFECTANTE que produce el cambio. */
  readonly articulo: string | null;
}

/**
 * Un LEAD, que **no es una afectación**.
 *
 * La diferencia importa y es la que un escéptico pilló falsificada en la
 * investigación: esto es lo que un TERCERO (Avance Jurídico) dice sobre una
 * norma, no lo que la norma dice de sí misma. Para escribir una `afectacion`
 * con `derivation = 'declarado_en_norma'` hay que ir a la norma AFECTANTE y
 * leer su cláusula. Este objeto solo dice **a qué norma hay que ir**.
 *
 * Por eso `tier` es `institucional` y nunca `primaria`, y por eso la constraint
 * `afectacion_vigencia_exige_primaria` rechazaría insertar esto como vigencia.
 */
export interface Lead {
  /** Qué unidad se ve afectada: Artículo, Parágrafo, Numeral, Inciso… */
  readonly unidad: string;
  readonly tipo: TipoLead;
  readonly afectante: NormaCitada;
  /** Diario Oficial de la norma AFECTANTE, tal como lo cita la nota. */
  readonly diarioOficial: string | null;
  /** Fecha de publicación en el DO, si la nota la da. ISO o null. */
  readonly fechaDiarioOficial: string | null;
  /**
   * La REGLA de vigencia, normalizada a una de las formas conocidas — no la
   * frase del editor. `null` cuando la nota no dice nada al respecto.
   */
  readonly reglaVigencia: "publicacion_diario_oficial" | "otra" | null;
  /** A qué documento de basedoc apunta la nota. El puntero para el siguiente paso. */
  readonly href: string | null;
  /** Índice de la caja `insRowN` de la que salió. Trazabilidad, no contenido. */
  readonly insRow: number;
}

export interface BasedocParse {
  readonly slug: string;
  /** Sello «Última actualización» del propio documento. */
  readonly ultimaActualizacion: string | null;
  readonly diarioOficialSello: string | null;
  readonly leads: readonly Lead[];
  /** Cajas que existen en el HTML. Si no cuadra con las del JS, algo falta. */
  readonly cajasEnHtml: number;
  readonly cajasEnJs: number;
  /**
   * Notas que NO se supieron interpretar y que **sí deberían serlo**. Esto es
   * un hueco real del parser: si sube, hay trabajo.
   */
  readonly noInterpretadas: number;
  /**
   * Notas de OPINIÓN del editor («En criterio del editor…», «Destaca el
   * editor…»). No son afectaciones y se descartan a propósito.
   *
   * Se cuentan aparte de `noInterpretadas` porque meterlas ahí inventaría un
   * hueco que no existe. Y son, además, exactamente la prosa con copyright que
   * este módulo nunca debe persistir: es criterio de Avance Jurídico, no un
   * hecho del ordenamiento.
   */
  readonly notasEditoriales: number;
  /** Bloques «Texto original de…»: la versión anterior del articulado. */
  readonly textosOriginales: number;
}

const VERBO_A_TIPO: ReadonlyArray<readonly [RegExp, TipoLead]> = [
  [/\bmodificad[oa]\b/i, "modifica"],
  [/\badicionad[oa]\b/i, "adiciona"],
  [/\bderogad[oa]\b/i, "deroga_expresa"],
  [/\bsubrogad[oa]\b/i, "subroga"],
  [/\bsustituid[oa]\b/i, "sustituye"],
  [/\breglamentad[oa]\b/i, "reglamenta"],
  [/\bINEXEQUIBLE\b/, "declara_inexequible_total"],
  [/\bEXEQUIBLE\s+CONDICIONAL/i, "declara_exequible_condicionada"],
  [/\banulad[oa]\b/i, "anula"],
  [/\bsuspendid[oa]\b/i, "suspende_provisionalmente"],
];

const MESES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

/** `18 de junio de 2025` → `2025-06-18`. Determinista; sin fecha no devuelve nada. */
export function fechaEsPanol(texto: string): string | null {
  const m = /(\d{1,2})\s+de\s+([a-zá-ú]+)\s+de\s+(\d{4})/i.exec(texto);
  if (!m) return null;
  const mes = MESES[(m[2] as string).toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${mes}-${(m[1] as string).padStart(2, "0")}`;
}

/** Quita etiquetas y resuelve entidades. Uso interno: el resultado NO se persiste. */
export function aTextoPlano(html: string): string {
  const sinTags = html.replace(/<[^>]+>/g, " ");
  const ent: Record<string, string> = {
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    ntilde: "ñ",
    Ntilde: "Ñ",
    uuml: "ü",
    nbsp: " ",
    amp: "&",
    quot: '"',
    lt: "<",
    gt: ">",
    ordm: "º",
    deg: "°",
  };
  return sinTags
    .replace(/&(\w+);/g, (_, e: string) => ent[e] ?? ` `)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** «Texto original de la Ley N de AAAA:» — la versión anterior, no un cambio. */
export function esTextoOriginal(texto: string): boolean {
  return /^\s*Texto original/i.test(texto);
}

/** Opinión del editor. Cita normas, pero no cambia el ordenamiento. */
export function esNotaEditorial(texto: string): boolean {
  return /(?:^|\s)-?\s*(?:En criterio del editor|Destaca el editor|A criterio del editor|En concepto del editor|Nota del editor)\b/i.test(
    texto,
  );
}

/**
 * Interpreta UNA nota y devuelve el lead, o `null` si no es una afectación
 * (los bloques «Texto original de…» no lo son) o no se supo leer.
 */
export function parseNota(htmlNota: string, insRow: number): Lead | null {
  const texto = aTextoPlano(htmlNota);

  // Los bloques de texto original NO son afectaciones: son la versión anterior
  // del articulado. Se reconocen y se descartan explícitamente.
  if (esTextoOriginal(texto)) return null;

  // La OPINIÓN del editor tampoco lo es, aunque cite una ley y un artículo:
  // «En criterio del editor…» es interpretación, no un cambio del ordenamiento.
  // Tratarla como afectación metería el juicio de una editorial privada en la
  // cadena de vigencia, que es justo lo que R1 prohíbe.
  if (esNotaEditorial(texto)) return null;

  const tipo = VERBO_A_TIPO.find(([re]) => re.test(texto))?.[1];
  if (!tipo) return null;

  // «... por el artículo 3 de la Ley 2460 de 16 de junio de 2025»
  const norma =
    /\b(?:por\s+el\s+art[íi]culo\s+(\d+[A-Za-z]?)\s+de\s+la\s+)?(Ley|Decreto(?:\s+Ley)?|Acto\s+Legislativo|Sentencia)\s+([\dA-Za-z-]+)\s+de\s+(?:\d{1,2}\s+de\s+[a-zá-ú]+\s+de\s+)?(\d{4})/i.exec(
      texto,
    );
  if (!norma) return null;

  // «publicada en el Diario Oficial No. 53.153 de 18 de junio de 2025»
  const doM = /Diario\s+Oficial\s+No\.?\s*([\d.]+)/i.exec(texto);
  const doFecha = doM
    ? fechaEsPanol(
        texto.slice(
          texto.indexOf(doM[0]) + doM[0].length,
          texto.indexOf(doM[0]) + doM[0].length + 60,
        ),
      )
    : null;

  // La regla se NORMALIZA a una forma conocida; no se guarda la frase.
  const reglaVigencia: Lead["reglaVigencia"] = /rige\s+a\s+partir\s+de\s+su\s+publicaci[óo]n/i.test(
    texto,
  )
    ? "publicacion_diario_oficial"
    : /\brige\b|\bvigencia\b|\bregir[áa]\b/i.test(texto)
      ? "otra"
      : null;

  const hrefM = /href=['"]([^'"]+)['"]/i.exec(htmlNota);

  // «Artículo modificado», «Parágrafo adicionado», «Numeral modificado»…
  const unidadM =
    /^-?\s*([A-Za-zÁ-Úá-ú]+)\s+(?:modificad|adicionad|derogad|subrogad|sustituid|reglamentad|anulad|suspendid)/i.exec(
      texto,
    );

  return {
    unidad: unidadM?.[1] ?? "Norma",
    tipo,
    afectante: {
      tipo: (norma[2] as string).replace(/\s+/g, " "),
      numero: norma[3] as string,
      anio: norma[4] as string,
      articulo: norma[1] ?? null,
    },
    diarioOficial: doM?.[1] ?? null,
    fechaDiarioOficial: doFecha,
    reglaVigencia,
    href: hrefM?.[1] ?? null,
    insRow,
  };
}

/**
 * Interpreta el par (HTML, JS compañero).
 *
 * Recibe los DOS cuerpos ya decodificados. Si el JS falta, el resultado sale
 * con `cajasEnJs: 0` y cero leads — y eso NO es «no hay afectaciones», es que
 * no se pidió el fichero que las tiene. La diferencia se ve en los conteos, que
 * por eso salen en el resultado.
 */
export function parseBasedoc(slug: string, html: string, js: string): BasedocParse {
  const cajasEnHtml = new Set(html.match(/insRow(\d+)\s*\(/g) ?? []).size;
  const defs = [...js.matchAll(/insRow(\d+)\s*\(\)\s*\{([\s\S]*?)\n\}/g)];

  const leads: Lead[] = [];
  let noInterpretadas = 0;
  let notasEditoriales = 0;
  let textosOriginales = 0;

  for (const def of defs) {
    const n = Number(def[1]);
    const cuerpo = def[2] ?? "";
    const desc = /description\[0\]\s*=\s*"([\s\S]*?)";/.exec(cuerpo);
    if (!desc) {
      noInterpretadas++;
      continue;
    }
    const lead = parseNota(desc[1] as string, n);
    if (lead) {
      leads.push(lead);
      continue;
    }
    // Cada descarte se clasifica. Un conteo que mete todo en el mismo cajón
    // no distingue «esto no era una afectación» de «esto no lo supe leer».
    const texto = aTextoPlano(desc[1] as string);
    if (esTextoOriginal(texto)) textosOriginales++;
    else if (esNotaEditorial(texto)) notasEditoriales++;
    else noInterpretadas++;
  }

  const sello = /<div[^>]*id=["']update_date["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const selloTexto = sello ? aTextoPlano(sello[1] as string) : null;

  return {
    slug,
    ultimaActualizacion: selloTexto ? fechaEsPanol(selloTexto) : null,
    diarioOficialSello: selloTexto
      ? (/Diario Oficial No\.?\s*([\d.]+)/i.exec(selloTexto)?.[1] ?? null)
      : null,
    leads,
    cajasEnHtml,
    cajasEnJs: defs.length,
    noInterpretadas,
    notasEditoriales,
    textosOriginales,
  };
}
