/**
 * Envío del digest. El transporte se inyecta.
 *
 * El proveedor de correo es una credencial; **elegirlo y pagarlo es de Daniel**.
 * Lo que sí es código —a quién se le manda, cómo, y qué NO puede pasar— se
 * escribe y se prueba aquí sin cuenta en ningún proveedor.
 *
 * ## El fallo del que este módulo protege, y es de los que salen en la prensa
 *
 * Mandar un digest a N suscriptores con las N direcciones en el mismo campo
 * `To:` (o en `Cc:`) **revela a cada suscriptor quiénes son los demás**. En este
 * proyecto es peor que en una lista cualquiera: la lista de destinatarios de un
 * monitor normativo es, en la práctica, una lista de quién sigue qué tema
 * jurídico. Es la misma información que §8.2 de `GOVERNANCE.md` protege.
 *
 * Por eso **un envío, un destinatario**, siempre, y hay un test que lo fija.
 * `Bcc` no se usa ni como atajo: un `Bcc` mal puesto es el mismo desastre, y
 * evitar la construcción entera es más barato que revisarla cada vez.
 */

/** Lo mínimo que hace falta de un proveedor. Cualquiera puede implementarlo. */
export interface Transporte {
  enviar(mensaje: MensajeSaliente): Promise<{ readonly id: string }>;
}

export interface MensajeSaliente {
  /** UN destinatario. La API no admite lista, y es a propósito. */
  readonly para: string;
  readonly asunto: string;
  readonly texto: string;
  /** Cabecera para que el cliente de correo ofrezca darse de baja en un clic. */
  readonly listUnsubscribe: string;
}

export interface ResultadoEnvio {
  readonly enviados: number;
  readonly fallidos: readonly { readonly para: string; readonly error: string }[];
  readonly omitidos: number;
}

export interface DigestListo {
  readonly suscripcionId: string;
  readonly correo: string;
  readonly texto: string;
  readonly novedades: number;
  readonly tokenBaja: string;
}

/** Asunto que dice de qué va sin gritar. */
export function asunto(novedades: number): string {
  return novedades === 1
    ? "regwatch-co · 1 novedad en los temas que sigues"
    : `regwatch-co · ${novedades} novedades en los temas que sigues`;
}

/**
 * Envía los digests, **uno por destinatario**.
 *
 * Un fallo en uno no detiene a los demás: se recoge y se sigue. Abortar el lote
 * por un correo rebotado dejaría sin aviso a todos los que venían detrás, y el
 * rebote de una dirección no dice nada de las otras.
 */
export async function enviarDigests(
  digests: readonly DigestListo[],
  transporte: Transporte,
  baseUrl: string,
): Promise<ResultadoEnvio> {
  const fallidos: { para: string; error: string }[] = [];
  let enviados = 0;
  let omitidos = 0;

  for (const d of digests) {
    // Un digest vacío no se manda. Se comprueba también aquí, no solo al
    // construirlo: es la última puerta antes de que salga.
    if (d.novedades === 0) {
      omitidos++;
      continue;
    }

    try {
      await transporte.enviar({
        para: d.correo,
        asunto: asunto(d.novedades),
        texto: d.texto,
        // Un enlace de baja que funciona SIN iniciar sesión. Obligar a
        // autenticarse para darse de baja es una forma de retener a alguien que
        // ya dijo que no, y la Ley 1581 da derecho a la supresión sin fricción.
        listUnsubscribe: `<${baseUrl}/baja/${d.tokenBaja}>`,
      });
      enviados++;
    } catch (e) {
      fallidos.push({ para: d.correo, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { enviados, fallidos, omitidos };
}

/**
 * ¿Se puede publicar un informe de la corrida?
 *
 * El informe de envío **no lleva direcciones**. Un log con los correos de los
 * suscriptores es una filtración esperando a que alguien comparta un log.
 */
export function informe(r: ResultadoEnvio): string {
  return [
    `enviados: ${r.enviados}`,
    `omitidos (sin novedades): ${r.omitidos}`,
    `fallidos: ${r.fallidos.length}`,
  ].join(" · ");
}
