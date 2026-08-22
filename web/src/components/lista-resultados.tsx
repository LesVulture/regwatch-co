import { diasDesde, etiquetaDeFila, hrefDeFila } from "../lib/presentacion.ts";
import { Badge } from "./ui/badge.tsx";
import { Card, CardTitle } from "./ui/card.tsx";

export function ListaResultados({ filas }: { filas: readonly Record<string, unknown>[] }) {
  return (
    <div>
      {filas.map((f) => {
        const titulo = String(f.titulo ?? "(sin título)");
        const href = hrefDeFila(f);
        const dias = diasDesde(f.captured_at);
        return (
          <Card key={String(f.id)}>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge>{etiquetaDeFila(f)}</Badge>
              <span>{String(f.referencia ?? "")}</span>
              {f.estado ? <span>· {String(f.estado).replaceAll("_", " ")}</span> : null}
              {f.posicion_semantica != null && f.posicion_lexica == null ? (
                <span>· lo encontró el vector</span>
              ) : null}
            </div>
            <CardTitle>
              {href ? (
                <a className="text-primary underline-offset-2 hover:underline" href={href}>
                  {titulo}
                </a>
              ) : (
                titulo
              )}
            </CardTitle>
            {/* La procedencia se muestra SIEMPRE, no en un desplegable: un
              resultado sin fuente visible invita a citarlo sin comprobarlo. */}
            <p className="mt-1 text-sm text-muted-foreground">
              <a
                className="text-primary underline-offset-2 hover:underline"
                href={String(f.url_fuente)}
                rel="noreferrer"
              >
                fuente
              </a>{" "}
              · capturado {String(f.captured_at ?? "").slice(0, 10)}
              {dias !== null ? ` · hace ${dias} día${dias === 1 ? "" : "s"}` : ""}
              {dias !== null && dias > 2
                ? " · frescura: rezago respecto de una corrida diaria"
                : ""}
              {" · "}tier {String(f.tier)}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
