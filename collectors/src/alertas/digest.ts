/**
 * Construcción del digest de alertas.
 *
 * Lo que NO está aquí es el envío: eso necesita un proveedor de correo. Lo que
 * sí está —qué cambió, para quién, desde cuándo y cómo se redacta— es lógica
 * pura y se puede escribir y probar hoy.
 *
 * ## Las dos reglas que gobiernan un digest, y no son de formato
 *
 * 1. **Nunca repetir.** La ventana empieza en `ultimo_envio`, no «hace una
 *    semana». Si un envío falla y se reintenta al día siguiente, la ventana
 *    sigue siendo la correcta; con una ventana fija se perdería un día entero
 *    de novedades, y nadie lo notaría.
 *
 * 2. **Un digest vacío NO se envía.** Un correo que dice «no hay novedades» es
 *    ruido, y el ruido semanal es lo que hace que la gente deje de abrir el
 *    correo que sí importa.
 */

export interface Suscripcion {
  readonly id: string;
  readonly temas: readonly string[];
  readonly cadencia: "diaria" | "semanal";
  /** `null` en la primera vez. */
  readonly ultimoEnvio: string | null;
}

/** Novedad candidata: cualquier cosa capturada con su procedencia. */
export interface Novedad {
  readonly tipo: "proyecto_ley" | "providencia" | "afectacion";
  readonly titulo: string;
  readonly referencia: string;
  readonly url: string;
  /** ISO. Cuándo entró al corpus. */
  readonly capturedAt: string;
}

export interface Digest {
  readonly suscripcionId: string;
  readonly desde: string | null;
  readonly hasta: string;
  readonly novedades: readonly Novedad[];
  /** Qué tema disparó cada novedad. Explicable, como manda §4 de GOVERNANCE. */
  readonly porTema: Readonly<Record<string, readonly Novedad[]>>;
}

/** Normaliza para comparar: sin acentos, minúsculas. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * ¿Esta novedad casa con este tema?
 *
 * Coincidencia LÉXICA, no semántica, y es una decisión: hay que poder responder
 * «¿por qué me llegó esto?» con un término concreto que aparece en el texto.
 * El coste se declara —no captura sinónimos ni paráfrasis— y la mitigación es
 * mantener la lista de temas, no cambiar a una distancia coseno que nadie puede
 * defender ante quien pregunta.
 */
export function casa(n: Novedad, tema: string): boolean {
  const t = norm(tema).trim();
  if (t === "") return false;
  return norm(`${n.titulo} ${n.referencia}`).includes(t);
}

/** Inicio de la ventana: `ultimo_envio`, o el fallback de la cadencia. */
export function ventanaDesde(s: Suscripcion, ahora: Date): Date {
  if (s.ultimoEnvio) return new Date(s.ultimoEnvio);
  const dias = s.cadencia === "diaria" ? 1 : 7;
  return new Date(ahora.getTime() - dias * 86_400_000);
}

/**
 * Construye el digest de una suscripción.
 *
 * `novedades` son las candidatas del corpus; aquí se filtran por ventana y por
 * tema. La ventana es **semiabierta** `(desde, hasta]`: una novedad capturada
 * exactamente en el instante del último envío ya se envió, y volver a mandarla
 * es el fallo por duplicación más fácil de cometer.
 */
export function construirDigest(
  s: Suscripcion,
  novedades: readonly Novedad[],
  ahora: Date,
): Digest {
  const desde = ventanaDesde(s, ahora);
  const hasta = ahora;

  const enVentana = novedades.filter((n) => {
    const t = new Date(n.capturedAt).getTime();
    return t > desde.getTime() && t <= hasta.getTime();
  });

  const porTema: Record<string, Novedad[]> = {};
  const vistas = new Set<string>();
  const salida: Novedad[] = [];

  for (const tema of s.temas) {
    const casan = enVentana.filter((n) => casa(n, tema));
    if (casan.length > 0) porTema[tema] = casan;
    for (const n of casan) {
      // Una novedad que casa con dos temas se lista en los dos, pero se cuenta
      // UNA vez: si no, el digest exagera cuánto pasó.
      const clave = `${n.tipo}|${n.referencia}`;
      if (!vistas.has(clave)) {
        vistas.add(clave);
        salida.push(n);
      }
    }
  }

  return {
    suscripcionId: s.id,
    desde: s.ultimoEnvio,
    hasta: hasta.toISOString(),
    novedades: salida,
    porTema,
  };
}

/**
 * ¿Se envía?
 *
 * Un correo que dice «no hay novedades» es ruido, y el ruido semanal es lo que
 * hace que la gente deje de abrir el correo que sí importa.
 */
export function debeEnviarse(d: Digest): boolean {
  return d.novedades.length > 0;
}

/**
 * Redacta el digest en texto plano.
 *
 * Cada novedad va con su URL. No es cortesía: el correo es la única superficie
 * del sistema que se lee **fuera** del sistema, así que si no lleva la fuente
 * dentro, se cita sin comprobar.
 */
export function redactar(d: Digest): string {
  const lineas: string[] = [];
  lineas.push("Novedades en regwatch-co");
  lineas.push(
    d.desde
      ? `Desde tu último aviso (${d.desde.slice(0, 10)}) hasta ${d.hasta.slice(0, 10)}.`
      : `Primer aviso. Hasta ${d.hasta.slice(0, 10)}.`,
  );
  lineas.push("");

  for (const [tema, ns] of Object.entries(d.porTema)) {
    lineas.push(`## ${tema} (${ns.length})`);
    for (const n of ns) {
      lineas.push(`- [${n.tipo}] ${n.referencia} — ${n.titulo}`);
      lineas.push(`  ${n.url}`);
    }
    lineas.push("");
  }

  lineas.push("---");
  // Las mismas dos advertencias que la UI y el MCP. Se repiten a propósito: el
  // correo se lee sin el resto del sistema delante.
  lineas.push("Esto no es asesoría jurídica: cada enlace lleva al texto oficial.");
  lineas.push("Que algo no aparezca aquí significa que no está en lo capturado, no que no exista.");
  return lineas.join("\n");
}
