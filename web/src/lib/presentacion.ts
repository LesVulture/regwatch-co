import { identidadNorma } from "../lib/consultas.ts";
import { etiquetaOrigen } from "../lib/filtros.ts";

export function diasDesde(iso: unknown): number | null {
  if (typeof iso !== "string" || iso.length < 10) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function hrefDeFila(f: Record<string, unknown>): string | null {
  const idn = identidadNorma(f.origen, f.referencia);
  if (idn) {
    return `/vigencia/${encodeURIComponent(idn.tipo)}/${encodeURIComponent(idn.numero)}/${idn.anio}`;
  }
  const id = typeof f.id === "string" ? f.id : null;
  if (!id) return null;
  if (f.origen === "proyecto_ley") return `/proyecto/${id}`;
  if (f.origen === "providencia") return `/providencia/${id}`;
  return null;
}

export function etiquetaDeFila(f: Record<string, unknown>): string {
  return etiquetaOrigen(String(f.origen ?? ""));
}
