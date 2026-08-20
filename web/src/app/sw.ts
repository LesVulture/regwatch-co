/// <reference lib="webworker" />
/**
 * Service worker de la PWA.
 *
 * ## Por qué una PWA en un monitor normativo, y qué NO debe cachear
 *
 * El caso de uso real es alguien consultando una norma desde un juzgado, una
 * comisión o un municipio con conexión mala. Que la aplicación abra sin red es
 * útil; que **sirva una vigencia vieja como si fuera actual** es exactamente el
 * fallo que este proyecto existe para no cometer.
 *
 * De ahí la política: **el armazón se cachea, los datos NO**. Una consulta de
 * vigencia sin red debe fallar de forma visible, no responder con lo de ayer.
 * Una respuesta obsoleta sobre si una norma está vigente es peor que ninguna,
 * porque tiene el mismo aspecto que la correcta.
 */

import { defaultCache } from "@serwist/turbopack/worker";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: (string | { url: string; revision: string | null })[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

const serwist = new Serwist({
  // `?? []` no es cosmético: con `exactOptionalPropertyTypes`, pasar
  // `undefined` no compila, y un precache vacío es un estado legítimo.
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // NADA de la API entra en caché. Va primero para ganar a `defaultCache`.
    {
      matcher: ({ url }: { url: URL }) =>
        url.pathname.startsWith("/rest/v1/") || url.hostname.endsWith(".supabase.co"),
      // NetworkOnly explícito: sin red, FALLA. Es la respuesta correcta para
      // una consulta de vigencia — servir la de ayer sería peor que no servir.
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
