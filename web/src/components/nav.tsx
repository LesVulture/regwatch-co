import { ATAJOS_CONSULTA } from "../lib/filtros.ts";

const ENLACES = [
  { href: "/", etiqueta: "Buscar" },
  { href: "/proyectos", etiqueta: "Proyectos" },
  { href: "/providencias", etiqueta: "Jurisprudencia" },
  { href: "/cobertura", etiqueta: "Cobertura" },
] as const;

export function Nav() {
  return (
    <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Principal">
      {ENLACES.map((e) => (
        <a key={e.href} className="text-primary underline-offset-2 hover:underline" href={e.href}>
          {e.etiqueta}
        </a>
      ))}
    </nav>
  );
}

export function Atajos() {
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      Atajos de consulta, no una taxonomía:{" "}
      {ATAJOS_CONSULTA.map((a, i) => (
        <span key={a.q}>
          {i > 0 ? " · " : null}
          <a
            className="text-primary underline-offset-2 hover:underline"
            href={`/?q=${encodeURIComponent(a.q)}`}
          >
            {a.etiqueta}
          </a>
        </span>
      ))}
    </p>
  );
}
