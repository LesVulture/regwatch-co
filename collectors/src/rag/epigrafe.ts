/**
 * El EPÍGRAFE de una norma: «Por medio de la cual se expide la ley de Salud
 * Mental y se dictan otras disposiciones.»
 *
 * Existe porque `norma.titulo` es `not null` y no había de dónde sacarlo. Sin
 * él, cargar el articulado de una ley nueva era imposible: `load-chunks.ts`
 * exige que la fila de `norma` exista ANTES, y crearla obligaba a escribir un
 * título a mano — es decir, a inventar un dato en la única tabla del sistema
 * cuya razón de ser es no tener ninguno inventado.
 *
 * ## De dónde sale, y por qué no del `<title>` de la página
 *
 * El `<title>` de la compilación es **de la compilación**, no de la ley:
 * «Leyes desde 1992 - Vigencia expresa y control de constitucionalidad
 * [LEY_1616_2013]». Guardarlo como título de la norma sería atribuirle a la ley
 * el encabezado de un tercero — y además republicar aparato editorial ajeno,
 * que `GOVERNANCE.md` prohíbe.
 *
 * El epígrafe, en cambio, **es parte del texto de la ley**: la fórmula que
 * sigue al número y precede al «EL CONGRESO DE COLOMBIA DECRETA». Es dominio
 * público por el art. 41 de la Ley 23 de 1982, igual que el articulado.
 *
 * ## Dónde corta, que es la única decisión de diseño
 *
 * Termina en el punto que CIERRA LA FRASE. Lo que viene detrás es de la
 * compilación («Resumen de Notas de Vigencia», «Jurisprudencia Vigencia») o el
 * propio decretorio, y arrastrarlo metería prosa editorial en una columna
 * pública.
 *
 * «El punto que cierra la frase» no es «el primer punto seguido de espacio», y
 * la diferencia costó títulos falsos. El epígrafe colombiano está lleno de
 * abreviaturas con punto —`Ley 5a. de 1992`, `suscrito en Bogotá, D. C.`,
 * `adoptado en la 72a. reunión`, `el artículo 3o.`— y cortar en la primera
 * devolvía un trozo que seguía midiendo más que `MIN` y por tanto se daba por
 * bueno. Medido sobre 512 páginas reales de basedoc: 6 títulos truncados y
 * plausibles, del tipo «Por la cual se modifica parcialmente la Ley 5a.», que
 * ni siquiera dice QUÉ Ley 5a. Eso es un valor inventado en `norma.titulo`,
 * que es `not null`, de lectura pública y alimenta la búsqueda léxica — justo
 * lo que la cabecera de `extraerEpigrafe` promete no hacer.
 *
 * Por eso hay DOS defensas y no una: `ABREVIATURAS` enumera las formas que no
 * cierran frase, y `CORTES` reconoce también el decretorio con sus variantes,
 * de modo que el corte por puntuación deje de ser la única barrera.
 */

import { aTextoPlano } from "../senado/basedoc.ts";

/** Las fórmulas con las que arranca un epígrafe colombiano. */
const APERTURAS =
  /Por\s+(?:medio\s+(?:de\s+la|del|de\s+las|de\s+los)\s+cual(?:es)?|la\s+cual|el\s+cual|las\s+cuales|los\s+cuales)\b/i;

/**
 * Marcas de que ya se salió del epígrafe. Si aparecen ANTES del primer punto
 * —pasa cuando la compilación mete su rótulo sin puntuar— cortan igual.
 */
const CORTES = [
  "Resumen de Notas de Vigencia",
  "Notas de Vigencia",
  "Notas del Editor",
  "Jurisprudencia Vigencia",
  "Concordancias",
  // Las tres formas del decretorio. Faltaban las dos últimas, y el único motivo
  // por el que no se colaba el articulado entero era el corte por punto — es
  // decir, la barrera que este módulo acaba de dejar de sobrecargar.
  "EL CONGRESO DE COLOMBIA",
  "EL CONGRESO DE LA REPÚBLICA",
  "EL CONGRESO DE LA REPUBLICA",
  "EL PRESIDENTE DE LA REPÚBLICA",
  "EL PRESIDENTE DE LA REPUBLICA",
];

/**
 * Lo que lleva punto y NO cierra frase, en el castellano jurídico colombiano.
 *
 * Lista cerrada y enumerada a propósito: es la clase de cosa que hay que poder
 * leer y discutir. Cada entrada casa el final del texto que precede al punto.
 */
const ABREVIATURAS = [
  /\b\d+\s*[oaºª]$/i, // 1o. 3o. 5a. 72a. — ordinales de artículo y de reunión
  /\bNos?$/i, // No. Nos.
  /\barts?$/i, // art. arts.
  /\b(?:núm|num|inc|lit|par|pág|pag|cap|tít|tit)$/i,
  /\b[A-ZÁÉÍÓÚÑ]$/, // inicial suelta: D. C. — E. S. P. — S. A.
];

/** ¿El punto en `i` cierra frase, o va detrás de una abreviatura? */
function cierraFrase(texto: string, i: number): boolean {
  const antes = texto.slice(0, i);
  return !ABREVIATURAS.some((a) => a.test(antes));
}

/** Un epígrafe más corto que esto no es un epígrafe. */
const MIN = 25;
/** Ni más largo. El de la Ley 1098 de 2006 tiene 62 caracteres. */
const MAX = 600;

/**
 * Extrae el epígrafe del HTML de la compilación.
 *
 * Devuelve `null` si no lo encuentra. **No adivina**: quien llame tiene que
 * tratar el `null` como «no hay título comprobable» y negarse a crear la fila,
 * no rellenarlo con «Ley 1616 de 2013».
 */
export function extraerEpigrafe(html: string): string | null {
  const texto = aTextoPlano(html);
  const m = texto.match(APERTURAS);
  if (!m || m.index === undefined) return null;

  let resto = texto.slice(m.index);

  // Corte duro por rótulo de la compilación, antes que por puntuación.
  let cortadoPorRotulo = false;
  for (const c of CORTES) {
    const i = resto.indexOf(c);
    if (i > 0) {
      resto = resto.slice(0, i);
      cortadoPorRotulo = true;
    }
  }

  // Corte por el primer punto que CIERRA FRASE: seguido de espacio o de final,
  // y que no venga detrás de una abreviatura.
  let punto = -1;
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] !== ".") continue;
    const sig = resto[i + 1];
    if (sig !== undefined && !/\s/.test(sig)) continue;
    if (!cierraFrase(resto, i)) continue;
    punto = i;
    break;
  }

  // Sin punto de cierre y sin rótulo que corte, no se sabe dónde acaba el
  // epígrafe. Devolver `resto` entero sería adivinar el final, que es el mismo
  // pecado que truncarlo: mejor `null` y que el llamador se niegue a crear la
  // norma.
  if (punto < 0 && !cortadoPorRotulo) return null;

  const epigrafe = (punto >= 0 ? resto.slice(0, punto + 1) : resto).trim();

  if (epigrafe.length < MIN || epigrafe.length > MAX) return null;
  return epigrafe;
}
