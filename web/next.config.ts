import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// `@serwist/turbopack`, NO `@serwist/next`.
//
// No es una preferencia: `@serwist/next` es un plugin de **webpack** —su propio
// código lo dice— y Turbopack es el bundler por defecto de Next 16. El paquete
// «obvio» no se engancha, y no falla ruidosamente: se queda sin generar el
// service worker, o sea una PWA que parece estar y no está.
const config: NextConfig = {
  // El repo es público: no se filtra el stack en las cabeceras.
  poweredByHeader: false,
  reactStrictMode: true,
  ...withSerwist({}),
};

export default config;
