import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { Nav } from "../components/nav.tsx";
import "./globals.css";

export const metadata = {
  title: "regwatch-co · monitor normativo colombiano",
  manifest: "/manifest.webmanifest",
  description:
    "Consulta de normatividad y trámite legislativo colombiano con procedencia " +
    "verificable. Cada afirmación lleva su fuente.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Sin `SerwistProvider` el worker se compila y NADIE lo registra: una PWA
    // que parece estar y no está. Es un fallo silencioso más de los de este
    // proyecto — todo verde, y offline no funciona.
    <SerwistProvider swUrl="/~serwist/sw.js" reloadOnOnline>
      <html lang="es">
        <body className="mx-auto max-w-3xl px-4 py-8 leading-relaxed">
          <a
            href="#contenido"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-background focus:px-3 focus:py-2"
          >
            Saltar al contenido
          </a>
          <header className="border-b border-border pb-4">
            <p className="text-xl font-semibold">
              <a className="text-foreground no-underline hover:text-primary" href="/">
                regwatch-co
              </a>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor normativo y legislativo colombiano. Cada afirmación lleva su fuente.
            </p>
            <Nav />
          </header>
          <main id="contenido" className="mt-6">
            {children}
          </main>
          <footer className="mt-12 border-t border-border pt-4 text-sm text-muted-foreground">
            {/* No es una nota legal de relleno: es la misma advertencia que la capa
              de consulta emite, escrita donde el lector la ve. */}
            <p>
              <strong className="text-foreground">Esto no es asesoría jurídica.</strong> Es un
              índice con procedencia; la lectura jurídica se hace sobre el texto oficial, y cada
              resultado enlaza al suyo.
            </p>
            <p className="mt-2">
              La ausencia de un resultado significa que no está en lo capturado,{" "}
              <strong className="text-foreground">no que no exista</strong>.
            </p>
          </footer>
        </body>
      </html>
    </SerwistProvider>
  );
}
