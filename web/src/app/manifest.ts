import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA.
 *
 * El caso de uso es alguien consultando una norma desde un juzgado, una comisión
 * o un municipio con conexión mala: que la aplicación abra sin red es útil. Lo
 * que NO se cachea —y por eso el service worker usa `NetworkOnly` para la API—
 * son los datos: servir una vigencia de ayer como si fuera de hoy sería peor que
 * no responder.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "regwatch-co · monitor normativo colombiano",
    short_name: "regwatch-co",
    description: "Normatividad y trámite legislativo colombiano con procedencia verificable.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0e3f8b",
    lang: "es-CO",
  };
}
