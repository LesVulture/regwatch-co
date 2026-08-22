import { notFound } from "next/navigation";
import { Avisos } from "../../../components/avisos.tsx";
import { CamposFicha, PieProcedencia } from "../../../components/ficha.tsx";
import { Badge } from "../../../components/ui/badge.tsx";
import { fichaProyecto } from "../../../lib/consultas.ts";
import { esUuid, etiquetaCamara, etiquetaEstado } from "../../../lib/filtros.ts";
import { consultanteDesdeEntorno } from "../../../lib/supabase.ts";

export default async function FichaProyecto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();

  let error: string | null = null;
  let fila: Record<string, unknown> | null = null;
  try {
    const r = await fichaProyecto(consultanteDesdeEntorno(), id, "ficha_individual");
    fila = r.filas[0] ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Proyecto de ley</h1>
        <Avisos error={error} />
      </>
    );
  }
  if (!fila) notFound();

  return (
    <>
      <p className="text-sm text-muted-foreground">
        <a className="text-primary underline-offset-2 hover:underline" href="/proyectos">
          Proyectos
        </a>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {String(fila.titulo ?? "(sin título)")}
      </h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge>Proyecto de ley</Badge>
        {fila.estado ? <Badge>{etiquetaEstado(String(fila.estado))}</Badge> : null}
      </div>
      {/* No hay tabla tramite_evento: no se inventa un timeline de trámite. */}
      <CamposFicha
        campos={[
          { etiqueta: "Referencia", valor: fila.referencia },
          { etiqueta: "Legislatura", valor: fila.legislatura },
          { etiqueta: "Cuatrienio", valor: fila.cuatrenio },
          { etiqueta: "Autor", valor: fila.autor },
          { etiqueta: "Comisión", valor: fila.comision },
          { etiqueta: "Estado", valor: fila.estado ? etiquetaEstado(String(fila.estado)) : null },
          { etiqueta: "Estado en la fuente", valor: fila.estado_original },
          {
            etiqueta: "Cámara del trámite (fuente Senado)",
            valor: fila.estado_camara ? etiquetaCamara(String(fila.estado_camara)) : null,
          },
          { etiqueta: "Número Senado", valor: fila.numero_senado_canonico },
          { etiqueta: "Número Cámara (texto fuente)", valor: fila.numero_camara_raw },
          { etiqueta: "Crosswalk", valor: fila.crosswalk },
          { etiqueta: "Motivo del crosswalk", valor: fila.crosswalk_motivo },
        ]}
      />
      <PieProcedencia url={fila.url_fuente} capturedAt={fila.captured_at} tier={fila.tier} />
    </>
  );
}
