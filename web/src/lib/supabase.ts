/**
 * Cliente de consulta contra PostgREST.
 *
 * Se habla con `fetch` en vez de con el SDK a propósito: lo único que este
 * producto necesita son llamadas de solo lectura, y una dependencia menos en
 * la superficie de un repo público es una decisión, no un ahorro.
 *
 * Usa la clave **publicable** (anon). Puede vivir en el cliente porque RLS ya
 * decide lo que se puede leer: lectura abierta en las tablas públicas, cerrada
 * en `captura`, y escritura denegada para anon en todas. La clave no es el
 * control de acceso; el control de acceso es la política.
 *
 * Además de RPC, lee `proyecto_ley` y `providencia` por GET. Medido 2026-08-22:
 * `ficha_proyecto` no está en el schema cache (PGRST202) y la tabla sí
 * responde 200. Sin este camino, un clic en un resultado de búsqueda enseña
 * el JSON de PostgREST en vez de la ficha. `captura` no se lee por aquí.
 */

import type { Consultante, TablaConsulta } from "./consultas.ts";

const TABLAS: ReadonlySet<TablaConsulta> = new Set(["proyecto_ley", "providencia"]);

export function crearConsultante(url: string, anonKey: string): Consultante {
  if (!url || !anonKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_ANON_KEY. Están en .env (gitignored); " +
        ".env.example tiene los huecos.",
    );
  }

  const raiz = url.replace(/\/$/, "").replace(/\/rest\/v1$/i, "");
  const auth = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };

  return {
    async rpc(nombre, args) {
      const res = await fetch(`${raiz}/rest/v1/rpc/${nombre}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...auth,
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

    async filasTabla(tabla, params) {
      if (!TABLAS.has(tabla)) {
        throw new Error(`tabla no permitida: ${tabla}`);
      }
      const qs = new URLSearchParams(params);
      const res = await fetch(`${raiz}/rest/v1/${tabla}?${qs}`, {
        headers: { Accept: "application/json", ...auth },
      });
      if (!res.ok) {
        throw new Error(`${tabla} devolvió ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
