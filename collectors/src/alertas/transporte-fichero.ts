/**
 * Transporte a fichero. **No manda correo, y no finge que lo manda.**
 *
 * El proveedor de correo es la única pieza del sistema que sigue necesitando
 * una cuenta de terceros. Mientras no la haya, este transporte deja cada
 * mensaje escrito en disco, tal como saldría. Eso permite correr la cadena de
 * alertas entera —construir el digest, decidir si se envía, redactarlo, marcar
 * la suscripción— y revisar el resultado, que es todo lo que se puede
 * comprobar sin un proveedor.
 *
 * Lo que NO hace, dicho aquí para que nadie lo deduzca del nombre: nadie
 * recibe nada. Un sistema de alertas cuyo transporte escribe ficheros no está
 * «funcionando en modo local», está **sin enviar**, y quien lo use tiene que
 * saberlo. Por eso el fichero se llama `SIN-ENVIAR-…`.
 *
 * La regla de un envío por destinatario se respeta igual: cada mensaje va a su
 * propio fichero. No es simetría estética — es que el día que se sustituya por
 * un proveedor real, el código de arriba no cambia.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MensajeSaliente, Transporte } from "./envio.ts";

export const DIRECTORIO_POR_DEFECTO = "artefactos/digests";

/** Nombre de fichero seguro y ordenable, con el destinatario a la vista. */
export function nombreFichero(mensaje: MensajeSaliente, sello: string, n: number): string {
  const destino = mensaje.para.replace(/[^a-zA-Z0-9._@-]/g, "_");
  return `SIN-ENVIAR-${sello}-${String(n).padStart(3, "0")}-${destino}.txt`;
}

/** Serializa el mensaje con sus cabeceras, para poder auditarlo. */
export function serializar(mensaje: MensajeSaliente): string {
  return [
    `To: ${mensaje.para}`,
    `Subject: ${mensaje.asunto}`,
    `List-Unsubscribe: ${mensaje.listUnsubscribe}`,
    "",
    mensaje.texto,
    "",
  ].join("\n");
}

/**
 * Crea el transporte.
 *
 * **Todavía no hay ningún comando que lo use**, y decirlo es parte del trato:
 * `enviarDigests()` recibe el transporte inyectado y nadie construye la tanda.
 * Este módulo es la pieza que faltaba del lado del PROVEEDOR, no el runner. El
 * README lo declara como ⛔, no como 🟡.
 *
 * `sello` se pasa —no se toma de `Date.now()` dentro— para que la salida sea
 * reproducible y para que los tests no dependan del reloj.
 */
export function transporteFichero(
  sello: string,
  directorio: string = DIRECTORIO_POR_DEFECTO,
): Transporte {
  mkdirSync(directorio, { recursive: true });
  let n = 0;
  return {
    async enviar(mensaje) {
      n += 1;
      const nombre = nombreFichero(mensaje, sello, n);
      writeFileSync(join(directorio, nombre), serializar(mensaje), "utf-8");
      // El id es la ruta: es lo que hay que abrir para comprobar qué se habría
      // mandado. Un id sintético aquí no serviría para nada.
      return { id: join(directorio, nombre) };
    },
  };
}
