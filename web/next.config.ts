import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// El `.env` vive en la RAÍZ del monorepo, que es donde está `.env.example` y
// donde lo pone quien sigue el README. Next, en cambio, corre desde `web/` y
// solo carga el `.env` de SU directorio.
//
// Sin esto la aplicación arranca, responde 200 y **toda consulta falla** con
// «Faltan SUPABASE_URL o SUPABASE_ANON_KEY» — medido el 2026-08-20 antes de
// arreglarlo. Es el peor tipo de fallo de configuración: parece que funciona.
//
// Se usa `process.loadEnvFile` de Node en vez de `@next/env` a propósito: la
// alternativa documentada exige añadir una dependencia, y este repo declara
// que una dependencia menos en un repo público es una decisión. Node 26 lo
// trae de serie.
//
// Ojo con el orden: Next evalúa este fichero DESPUÉS de haber cargado los
// `.env` de `web/`, así que lo de la raíz NO pisa una configuración local —
// `loadEnvFile` no sobrescribe lo que ya está en `process.env`.
const raiz = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(raiz)) process.loadEnvFile(raiz);

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
