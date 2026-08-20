import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

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
        <body
          style={{
            fontFamily: "system-ui, -apple-system, sans-serif",
            maxWidth: "56rem",
            margin: "0 auto",
            padding: "2rem 1rem",
            lineHeight: 1.6,
          }}
        >
          <header style={{ borderBottom: "1px solid #ddd", paddingBottom: "1rem" }}>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>regwatch-co</h1>
            <p style={{ margin: ".25rem 0 0", color: "#555", fontSize: ".9rem" }}>
              Monitor normativo y legislativo colombiano. Cada afirmación lleva su fuente.
            </p>
          </header>
          <main>{children}</main>
          <footer
            style={{
              borderTop: "1px solid #ddd",
              marginTop: "3rem",
              paddingTop: "1rem",
              fontSize: ".85rem",
              color: "#555",
            }}
          >
            {/* No es una nota legal de relleno: es la misma advertencia que la capa
              de consulta emite, escrita donde el lector la ve. */}
            <p>
              <strong>Esto no es asesoría jurídica.</strong> Es un índice con procedencia; la
              lectura jurídica se hace sobre el texto oficial, y cada resultado enlaza al suyo.
            </p>
            <p>
              La ausencia de un resultado significa que no está en lo capturado,{" "}
              <strong>no que no exista</strong>.
            </p>
          </footer>
        </body>
      </html>
    </SerwistProvider>
  );
}
