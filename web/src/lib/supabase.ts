/**
 * Cliente de consulta contra PostgREST.
 *
 * Se habla con `fetch` en vez de con el SDK a propósito: lo único que este
 * producto necesita son dos llamadas RPC de solo lectura, y una dependencia
 * menos en la superficie de un repo público es una decisión, no un ahorro.
 *
 * Usa la clave **publicable** (anon). Puede vivir en el cliente porque RLS ya
 * decide lo que se puede leer: lectura abierta en las tablas públicas, cerrada
 * en `captura`, y escritura denegada para anon en todas. La clave no es el
 * control de acceso; el control de acceso es la política.
 */

import type { Consultante } from "./consultas.ts";

export function crearConsultante(url: string, anonKey: string): Consultante {
  if (!url || !anonKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_ANON_KEY. Están en .env (gitignored); " +
        ".env.example tiene los huecos.",
    );
  }

  return {
    async rpc(nombre, args) {
      const res = await fetch(`${url}/rest/v1/rpc/${nombre}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(args),
      });

      if (!res.ok) {
        // El cuerpo del error se propaga: un fallo mudo aquí se confunde con
        // «no hay resultados», que es exactamente la confusión que el resto del
        // sistema trabaja para evitar.
        throw new Error(`${nombre} devolvió ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }

      const json = await res.json();
      return { filas: Array.isArray(json) ? json : [json] };
    },
  };
}

/** Lee la configuración del entorno, fallando claro si falta. */
export function consultanteDesdeEntorno(): Consultante {
  return crearConsultante(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_ANON_KEY ?? "");
}
