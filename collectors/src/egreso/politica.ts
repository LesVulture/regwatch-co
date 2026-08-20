/**
 * Lista de egreso por procedencia. **Qué sale del sistema y qué no.**
 *
 * El plan la exige «en código antes de exponer la API» (§15.3) y la razón es
 * concreta: «API JSON pública» + «dumps semanales a git» + caché de bytes
 * crudos en un repo público es **redistribución masiva**, que es el verbo que
 * aparece en la prohibición de Avance Jurídico («divulgación masiva»), en la
 * del DNP («republicar»), en la de la Cámara («reproducción total o parcial») y
 * en el tipo penal del artículo 269F del Código Penal.
 *
 * ## Por qué es un módulo y no una nota en la documentación
 *
 * Una regla de egreso que vive en prosa se cumple mientras alguien se acuerda.
 * Al añadir el endpoint número catorce, nadie se acuerda. Aquí la regla es una
 * función que hay que llamar, y lo que no pasa por ella no sale.
 *
 * ## El caso que mejor explica el diseño: el correo de un congresista
 *
 * Los 181 correos institucionales **sí** se pueden almacenar y usar: la Ley 1712
 * obliga al Estado a publicarlos y el Decreto 1377 califica como público el dato
 * relativo a la calidad de servidor público. Lo que no se puede es **volcarlos
 * en bloque**.
 *
 * O sea que la legalidad del MISMO campo depende del CONTEXTO en que sale: la
 * ficha de una persona es legítima, el dump de las 181 es otra cosa. Por eso
 * `contexto` no es un parámetro opcional de esta API.
 */

/** Dónde va a parar el dato. Decide qué se puede llevar consigo. */
export type ContextoEgreso =
  /** Ficha de UN registro pedido por su identificador. */
  | "ficha_individual"
  /** Respuesta de API que devuelve varios registros. */
  | "api_bloque"
  /** Dump semanal a git: público, permanente e indexable. */
  | "dump"
  /** MCP server: lo consume un agente, que puede iterar sin cansarse. */
  | "mcp";

/** De dónde viene el dato. Decide qué se le puede hacer. */
export type Procedencia =
  /** Texto normativo oficial: leyes, decretos, sentencias. */
  | "normativo_oficial"
  /** Hechos y metadatos: trámite, jurisprudencia, afectaciones. */
  | "hecho_metadato"
  /** Prosa de un tercero con derechos: Avance Jurídico y similares. */
  | "prosa_editorial"
  /** Prensa. */
  | "prensa"
  /** Datos de contacto de servidores públicos. */
  | "contacto_servidor_publico"
  /** Orientación política — dato SENSIBLE del art. 5 de la Ley 1581. */
  | "orientacion_politica"
  /**
   * Datos de un SUSCRIPTOR: su correo y los temas que sigue.
   *
   * Categoría aparte de `contacto_servidor_publico` a propósito. Un congresista
   * es servidor público y su correo institucional es dato público por su
   * función; un suscriptor es un ciudadano particular que confió un correo para
   * recibir alertas, y nada más.
   *
   * Y los TEMAS son tan delicados como el correo: «a qué normas le sigo la
   * pista» puede revelar la actividad profesional de alguien, un litigio en
   * curso o su posición política.
   */
  | "dato_suscriptor";

export interface Veredicto {
  readonly sale: boolean;
  /** Por qué. Se registra: una denegación sin motivo no es auditable. */
  readonly motivo: string;
  /** Norma o cláusula que lo sostiene. */
  readonly fundamento: string;
  /** Condiciones que hay que cumplir para que salga. */
  readonly condiciones?: readonly string[];
}

const NUNCA_EN_BLOQUE: readonly ContextoEgreso[] = ["api_bloque", "dump", "mcp"];

/**
 * ¿Puede salir un dato de esta procedencia por este contexto?
 *
 * Es deliberadamente aburrida: una tabla de casos, sin ingenio. La sofisticación
 * en una regla legal es un sitio donde esconder un error.
 */
export function puedeSalir(p: Procedencia, contexto: ContextoEgreso): Veredicto {
  switch (p) {
    case "normativo_oficial":
      return {
        sale: true,
        motivo: "texto normativo oficial",
        fundamento: "Ley 23 de 1982, art. 41",
        // El art. 41 es una limitación CONDICIONADA, no dominio público sin más.
        condiciones: [
          "debe acompañarse del número de Diario Oficial",
          "debe conservarse el texto sin alterar",
        ],
      };

    case "hecho_metadato":
      return {
        sale: true,
        motivo: "hechos y metadatos: no son obra protegible",
        fundamento: "los hechos no son objeto de derecho de autor",
        condiciones: ["debe acompañarse de url_fuente y captured_at"],
      };

    case "prosa_editorial":
      // Sin excepción y sin umbral: «en ningún volumen» es literal.
      return {
        sale: false,
        motivo: "prosa editorial de un tercero con derechos — en ningún volumen",
        fundamento:
          "Avance Jurídico Casa Editorial S.A.S., «Derechos de autor reservados»; " +
          "prohibición de aprovechamiento en publicaciones similares",
      };

    case "prensa":
      return {
        sale: true,
        motivo: "solo título, medio, fecha, URL y snippet corto",
        fundamento: "Ley 23 de 1982, arts. 31 y 34 (cita e información de prensa)",
        condiciones: [
          "NUNCA el cuerpo completo",
          "snippet de 300 caracteres como máximo",
          "atribución al medio, siempre",
          "enlace al original, siempre",
        ],
      };

    case "contacto_servidor_publico":
      // El caso que explica por qué `contexto` es obligatorio en esta API.
      if (NUNCA_EN_BLOQUE.includes(contexto)) {
        return {
          sale: false,
          motivo:
            `el correo institucional NO sale en bloque (contexto: ${contexto}). ` +
            "Almacenarlo y mostrarlo en una ficha individual sí es legítimo; " +
            "volcar los 181 es otra cosa",
          fundamento: "Ley 1581 de 2012 (finalidad y proporcionalidad); §15.4 del plan",
        };
      }
      return {
        sale: true,
        motivo: "dato de contacto en la ficha de UNA persona",
        fundamento:
          "Ley 1712 de 2014 (el Estado debe publicarlos) + Decreto 1377 de 2013 " +
          "(dato público por la calidad de servidor público)",
        condiciones: ["solo el registro pedido por su identificador"],
      };

    case "dato_suscriptor":
      // Sin excepción y sin contexto que lo cambie: NO sale por ningún canal.
      // El correo se usa para ENVIAR el digest y para nada más; los temas, para
      // construirlo. Ni siquiera en la ficha del propio usuario pasa por aquí:
      // eso lo sirve RLS, que es otra cosa y otro camino.
      return {
        sale: false,
        motivo:
          "dato de un suscriptor (correo y temas de interés): no sale por ningún " +
          "canal de egreso. Se usa para enviar el digest y para nada más",
        fundamento:
          "Ley 1581 de 2012, arts. 4 (finalidad) y 5 — los temas que alguien " +
          "sigue pueden revelar su actividad profesional, un litigio o su posición",
      };

    case "orientacion_politica":
      // La defensa es sólida pero NO es obvia, y el plan exige que esté
      // razonada por escrito antes de tratarla.
      return {
        sale: true,
        motivo:
          "militancia declarada de un congresista en ejercicio: hecho público " +
          "e inseparable de su función",
        fundamento:
          "Ley 1581 de 2012, art. 5 lo lista como SENSIBLE y el art. 6 prohíbe " +
          "tratarlo salvo excepción — la excepción aplicable debe quedar razonada " +
          "por escrito en GOVERNANCE.md, no darse por obvia",
        condiciones: [
          "la justificación tiene que estar escrita en GOVERNANCE.md",
          "nunca como criterio de segmentación ni de perfilado",
        ],
      };
  }
}

/** Longitud máxima de un extracto de prensa. */
export const SNIPPET_MAX = 300;

/**
 * Recorta un extracto de prensa al máximo permitido, sin cortar una palabra por
 * la mitad. Devolver menos es correcto; devolver de más es el problema.
 */
export function recortarSnippet(texto: string, max: number = SNIPPET_MAX): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const cortado = limpio.slice(0, max);
  const ultimo = cortado.lastIndexOf(" ");
  return `${(ultimo > max * 0.6 ? cortado.slice(0, ultimo) : cortado).trimEnd()}…`;
}

/**
 * Filtra un registro dejando SOLO los campos que pueden salir.
 *
 * Trabaja por LISTA BLANCA: un campo cuya procedencia no esté declarada no sale.
 * Al revés —lista negra— un campo nuevo saldría por defecto, y el fallo sería
 * justo el que este módulo existe para evitar.
 */
export function filtrarRegistro<T extends Record<string, unknown>>(
  registro: T,
  procedencias: Readonly<Record<string, Procedencia>>,
  contexto: ContextoEgreso,
): { readonly datos: Record<string, unknown>; readonly omitidos: readonly string[] } {
  const datos: Record<string, unknown> = {};
  const omitidos: string[] = [];

  for (const [campo, valor] of Object.entries(registro)) {
    const p = procedencias[campo];
    if (!p) {
      // Campo sin procedencia declarada: NO sale. Es la lista blanca.
      omitidos.push(campo);
      continue;
    }
    const v = puedeSalir(p, contexto);
    if (!v.sale) {
      omitidos.push(campo);
      continue;
    }
    datos[campo] = p === "prensa" && typeof valor === "string" ? recortarSnippet(valor) : valor;
  }

  return { datos, omitidos };
}
