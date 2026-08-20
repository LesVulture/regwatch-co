/**
 * Route Handler que sirve el service worker.
 *
 * ⚠️ El directorio es `[path]` y NO `[...path]`: `createSerwistRoute` declara
 * `params: Promise<{ path: string }>`, y un catch-all de Next tipa `path` como
 * `string[]`. Con `[...path]` el build falla en el validador de rutas — que es
 * la forma buena de enterarse, pero cuesta un rato si uno copia la receta de
 * otra versión.
 *
 * En `@serwist/turbopack` el worker no se emite como un fichero estático del
 * build: se compila y se sirve por esta ruta. Es la diferencia de fondo con
 * `@serwist/next`, y la razón de que copiar la receta de webpack no funcione.
 */

import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    // Por defecto compila el worker con `esbuild-wasm`. Se usa el esbuild
    // NATIVO, que ya está en el árbol (lo trae vitest) y ya está aprobado en
    // `allowBuilds`: una dependencia menos en la superficie de un repo público,
    // y ningún script de instalación nuevo que decidir.
    useNativeEsbuild: true,
    globDirectory: ".next",
    globPatterns: ["static/**/*.{js,css,woff2}"],
  },
);
