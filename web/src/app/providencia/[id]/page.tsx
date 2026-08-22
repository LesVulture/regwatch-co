import { notFound } from "next/navigation";
import { Avisos } from "../../../components/avisos.tsx";
import { CamposFicha, PieProcedencia } from "../../../components/ficha.tsx";
import { Badge } from "../../../components/ui/badge.tsx";
import { fichaProvidencia } from "../../../lib/consultas.ts";
import { esUuid } from "../../../lib/filtros.ts";
import { consultanteDesdeEntorno } from "../../../lib/supabase.ts";

export default async function FichaProvidencia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();

  let error: string | null = null;
  let fila: Record<string, unknown> | null = null;
  try {
    const r = await fichaProvidencia(consultanteDesdeEntorno(), id, "ficha_individual");
    fila = r.filas[0] ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Providencia</h1>
        <Avisos error={error} />
      </>
    );
  }
  if (!fila) notFound();

  return (
    <>
      <p className="text-sm text-muted-foreground">
        <a className="text-primary underline-offset-2 hover:underline" href="/providencias">
          Jurisprudencia
        </a>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {String(fila.titulo ?? fila.sentencia ?? "(sin título)")}
      </h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge>Jurisprudencia</Badge>
        {fila.tipo ? <Badge>{String(fila.tipo)}</Badge> : null}
      </div>
      <CamposFicha
        campos={[
          { etiqueta: "Sentencia", valor: fila.sentencia },
          { etiqueta: "Tipo", valor: fila.tipo },
          { etiqueta: "Fecha de publicación", valor: fila.fecha_publicacion },
          { etiqueta: "Fecha de sentencia", valor: fila.fecha_sentencia },
          { etiqueta: "Expediente", valor: fila.expediente },
          { etiqueta: "Magistrados", valor: fila.magistrados },
        ]}
      />
      {typeof fila.url_texto === "string" && fila.url_texto !== "" ? (
        <p className="mt-3 text-sm">
          <a
            className="text-primary underline-offset-2 hover:underline"
            href={fila.url_texto}
            rel="noreferrer"
          >
            texto en la fuente
          </a>
        </p>
      ) : null}
      <PieProcedencia url={fila.url_fuente} capturedAt={fila.captured_at} tier={fila.tier} />
    </>
  );
}
