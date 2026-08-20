/**
 * Articulado de una norma: el paso que convierte un LEAD en una AFECTACIÓN.
 *
 * `basedoc.ts` devuelve leads —«alguien dice que la Ley X modificó la Ley Y»—.
 * Este módulo va a la norma AFECTANTE y busca la cláusula donde ella misma lo
 * dice. Esa cláusula es `texto_soporte`, y es lo que permite escribir una fila
 * con `derivation = 'declarado_en_norma'` y `tier = 'primaria'`.
 *
 * Sin este paso, la vigencia saldría de lo que una editorial privada resume.
 * Con él, sale del texto de la ley. **Esa es la diferencia entre regwatch-co y
 * una compilación más**, y es literalmente la constraint
 * `afectacion_vigencia_exige_primaria`.
 *
 * ## La distinción legal, que aquí sí permite guardar el texto
 *
 * El sitio lo edita Avance Jurídico, pero **el articulado de una ley no es
 * suyo**: es texto oficial, de dominio público por el artículo 41 de la Ley 23
 * de 1982. Lo que sí es suyo son las NOTAS —y por eso `basedoc.ts` no guarda ni
 * una palabra de ellas—. Aquí se guarda la cláusula de la ley; allí no se
 * guarda el comentario del editor. No es la misma regla aplicada distinto: son
 * dos cosas jurídicamente distintas.
 */

import { aTextoPlano } from "./basedoc.ts";

/** Un artículo del texto oficial, con su número y su texto. */
export interface Articulo {
  readonly numero: number;
  /**
   * Sufijo de letra de los artículos AÑADIDOS por una reforma: `36A`, `36B`.
   * Cadena vacía en el caso normal.
   *
   * No es un adorno: sin él, `ARTÍCULO 36A` y `ARTÍCULO 36` colapsan al mismo
   * número, y son **artículos distintos**. En el chunking eso produce dos
   * chunks con el mismo id y una cita ambigua — que es lo peor que le puede
   * pasar a R2, porque la cita PARECE resolver.
   */
  readonly sufijo: string;
  /** `36` o `36A`. Es lo que identifica al artículo de verdad. */
  readonly designacion: string;
  /** El encabezado tal como aparece: `ARTÍCULO 3o.`, `ARTÍCULO 36A.` */
  readonly encabezado: string;
  readonly texto: string;
}

/**
 * Parte el texto oficial en artículos.
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 * 1. **Las entidades HTML hay que resolverlas ANTES.** El documento escribe
 *    `ART&Iacute;CULO`, así que buscar `ARTÍCULO` sobre el HTML crudo no
 *    encuentra nada — y no falla: devuelve cero artículos.
 *
 * 2. **La búsqueda es sensible a mayúsculas, y tiene que serlo.** Una ley
 *    modificatoria CITA dentro de sí el texto que sustituye: «ARTÍCULO 3o.
 *    Modifíquese el artículo 1o de la Ley 1616…, el cual quedará así:
 *    *Artículo 1o. Objeto…*». Los encabezados REALES van en mayúscula; las
 *    citas del texto ajeno, en versalita. Con `/i` la Ley 2460 de 2025 da **79
 *    artículos donde tiene 39**, y los sobrantes son texto de OTRA ley colado
 *    como si fuera de esta. Un artículo fantasma no lanza ningún error: se
 *    queda ahí, con el número de otro, esperando a que alguien lo cite.
 *
 * 3. **Los artículos añadidos llevan sufijo de letra: `36A`, `36B`.** Es la
 *    convención con la que una reforma inserta articulado nuevo sin renumerar
 *    el resto. Capturar solo los dígitos hace que `ARTÍCULO 36A` colapse con
 *    `ARTÍCULO 36` — medido en la Ley 1616 de 2013, donde el 36A lo añadió la
 *    reforma de 2025. Dos artículos distintos con el mismo identificador
 *    producen una cita ambigua, y una cita ambigua es peor que una que falta:
 *    parece resolver.
 */
/**
 * Deja solo el articulado: quita el aparato editorial de Avance Jurídico.
 *
 * ESTO NO ES LIMPIEZA COSMÉTICA, ES LA REGLA LEGAL DEL PROYECTO. El articulado
 * es dominio público (art. 41 de la Ley 23 de 1982); las notas de vigencia, la
 * legislación anterior, las notas del editor y «la forma de presentación y
 * disposición de la compilación» **no lo son**, y Avance Jurídico lo declara
 * expresamente en el pie de cada documento.
 *
 * Sin esto, `partirArticulos` mete esa capa dentro del texto de los artículos,
 * porque `aTextoPlano` aplana TODAS las etiquetas por igual y el último
 * artículo se extiende hasta el final del fichero. Medido sobre la Ley 1616 de
 * 2013 el 2026-08-20: **21 de 37 chunks contaminados (57 %)**, y el chunk del
 * artículo 36A se tragaba 1.190 caracteres del aviso de copyright — el 40 % de
 * su propio texto. La tabla `chunk` es de LECTURA PÚBLICA, así que eso se
 * habría republicado.
 *
 * Los cortes son estructurales, no adivinados. Verificado en el HTML servido:
 * `<!--Fin documento-->` y `<div id="logo_aj">` aparecen UNA vez cada uno, y
 * hay 53 anclas `caja_vja_encabezado*` emparejadas 1:1 con 53 tablas `caja_*`
 * (que llegan VACÍAS: las puebla `insRowN()` desde el JS acompañante).
 */
export function soloArticulado(html: string): string {
  // 1. El documento termina donde la fuente dice que termina. Lo que sigue es
  //    el bloque de copyright. Se quitan las DOS marcas por separado: si la
  //    fuente dejara de emitir el comentario, el div sigue cayendo.
  const fin = html.search(/<!--\s*Fin\s+documento\s*-->/i);
  let s = fin >= 0 ? html.slice(0, fin) : html;
  s = s.replace(/<div id="logo_aj">[\s\S]*$/i, " ");

  // 2. El aparato editorial: el ancla que lo titula y la tabla que lo contiene.
  s = s.replace(/<div>\s*<a class="caja_vja_encabezado[^"]*"[\s\S]*?<\/a>\s*<\/div>/gi, " ");
  s = s.replace(/<table[^>]*class="caja_[^"]*"[\s\S]*?<\/table>/gi, " ");

  // 3. Navegación e imágenes: «Ir al inicio», «Siguiente», flechas. No son
  //    articulado y ensucian el texto citable.
  s = s.replace(/<a[^>]*title="Ir al inicio"[\s\S]*?<\/a>/gi, " ");
  s = s.replace(/<a[^>]*class=["']?antsig["']?[^>]*>[\s\S]*?<\/a>/gi, " ");
  s = s.replace(/<img[^>]*>/gi, " ");

  return s;
}

/**
 * Quita las acotaciones del editor que van INLINE, entre `&lt;` y `&gt;`:
 * `<Ver Notas del Editor>`, `<Artículo modificado por el artículo 3 de la Ley
 * 2460 de 2025. El nuevo texto es el siguiente:>`.
 *
 * **Es una decisión legal, no estructural, y por eso va nombrada.** Esa prosa
 * es la voz del compilador, no la del legislador. El dato que transporta —qué
 * norma afectó a cuál— no se pierde: es trabajo de `basedoc.ts`, que lo extrae
 * como `Lead` y cuyo tipo no tiene ningún campo donde quepa la prosa del
 * editor. Aquí se separa articulado de aparato; allí se captura la afectación.
 *
 * Se aplica sobre el texto YA aplanado, donde no quedan etiquetas reales: todo
 * `<...>` que sobreviva vino de un `&lt;...&gt;` del original.
 */
export function sinNotasDelEditor(texto: string): string {
  return texto
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function partirArticulos(html: string): Articulo[] {
  const texto = sinNotasDelEditor(aTextoPlano(soloArticulado(html)));
  const marcas = [...texto.matchAll(/ART[IÍ]CULO\s*(\d+)([A-Z]?)\s*[oº°]?\s*\.?/g)];

  const salida: Articulo[] = [];
  for (const [i, m] of marcas.entries()) {
    const desde = m.index ?? 0;
    const hasta = marcas[i + 1]?.index ?? texto.length;
    const numero = Number(m[1]);
    const sufijo = m[2] ?? "";
    salida.push({
      numero,
      sufijo,
      designacion: `${numero}${sufijo}`,
      encabezado: m[0].trim(),
      texto: texto.slice(desde, hasta).trim(),
    });
  }
  return salida;
}

/** Verbos con los que una norma declara que cambia a otra. */
const VERBO_DECLARATIVO =
  /\b(Modif[íi]quese|Adici[óo]nese|Der[óo]guese|Sustit[úu]yase|Subr[óo]guese|Reglam[ée]ntese|An[úu]lese)\b/i;

export interface ClausulaAfectacion {
  readonly articuloAfectante: number;
  /** Verbo con el que la norma lo declara. Es la prueba de que lo declara ELLA. */
  readonly verbo: string;
  /** Norma que resulta afectada, según el propio texto. */
  readonly afectada: { readonly tipo: string; readonly numero: string; readonly anio: string };
  /** Artículo concreto de la norma afectada, si el texto lo dice. */
  readonly articuloAfectado: number | null;
  /** La cláusula VERBATIM. Es `texto_soporte`: sin esto no hay afectación. */
  readonly textoSoporte: string;
}

/**
 * Busca en un artículo la cláusula donde la norma declara afectar a otra.
 *
 * Devuelve `null` cuando el artículo no declara nada — que es el caso normal:
 * la mayoría de los artículos de una ley no modifican nada.
 */
export function clausulaDeAfectacion(art: Articulo): ClausulaAfectacion | null {
  const verbo = VERBO_DECLARATIVO.exec(art.texto);
  if (!verbo) return null;

  // «Modifíquese el artículo 1o de la Ley 1616 de 2013»
  const m =
    /(?:el\s+art[íi]culo\s+(\d+)\s*[oº°]?\s+de\s+la\s+)?(Ley|Decreto(?:\s+Ley)?|Acto\s+Legislativo)\s+([\dA-Za-z-]+)\s+de\s+(\d{4})/i.exec(
      art.texto.slice(verbo.index, verbo.index + 400),
    );
  if (!m) return null;

  // La cláusula, no el artículo entero: desde el verbo hasta el final de la
  // frase declarativa. Guardar el artículo completo metería el texto sustituido
  // dentro de la prueba, que es otra cosa.
  const desde = verbo.index;
  const trozo = art.texto.slice(desde);
  const fin = /(?:quedar[áa]\s+as[íi]\s*:|\.)/i.exec(trozo);
  const textoSoporte =
    `${art.encabezado} ${trozo.slice(0, fin ? fin.index + fin[0].length : 300)}`.trim();

  return {
    articuloAfectante: art.numero,
    verbo: verbo[1] as string,
    afectada: {
      tipo: (m[2] as string).replace(/\s+/g, " "),
      numero: m[3] as string,
      anio: m[4] as string,
    },
    articuloAfectado: m[1] ? Number(m[1]) : null,
    textoSoporte,
  };
}

/**
 * Encuentra la cláusula de vigencia de la norma.
 *
 * Es lo que va en `fecha_regla`: **la regla, no su resultado**. Se guarda la
 * frase de la ley para que el cálculo sea re-ejecutable y auditable.
 */
export function clausulaVigencia(arts: readonly Articulo[]): string | null {
  // Suele ser el último artículo, pero se busca por contenido y no por posición:
  // asumir «el último» funciona hasta la primera ley que añade disposiciones
  // transitorias después.
  for (const a of [...arts].reverse()) {
    if (/\bVIGENCIA\b|entrar[áa]\s+a\s+regir|rige\s+a\s+partir/i.test(a.texto)) {
      const m =
        /((?:La presente ley|El presente decreto|Esta ley)[^.]*(?:regir|vigencia)[^.]*\.)/i.exec(
          a.texto,
        );
      return m?.[1]?.trim() ?? a.texto.slice(0, 300);
    }
  }
  return null;
}

/**
 * ¿La regla de vigencia permite derivar una fecha SIN un LLM?
 *
 * Solo `true` cuando la regla ata la vigencia a la publicación en el Diario
 * Oficial: entonces `fecha_efecto` = fecha del DO, y eso es aritmética, no
 * interpretación. Cualquier otra redacción —vacatio condicionada, «a los seis
 * meses de la reglamentación»— devuelve `false` y la fecha queda
 * `no_determinable`, que es la respuesta correcta y la que R1 exige.
 */
export function reglaEsDeterminista(regla: string | null): boolean {
  if (!regla) return false;
  return /publicaci[óo]n\s+en\s+el\s+Diario\s+Oficial|a\s+partir\s+de\s+su\s+(?:sanci[óo]n|promulgaci[óo]n|publicaci[óo]n)/i.test(
    regla,
  );
}
