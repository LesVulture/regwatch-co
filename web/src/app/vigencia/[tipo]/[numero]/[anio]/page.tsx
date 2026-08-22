import Form from "next/form";
import { Avisos } from "../../../../../components/avisos.tsx";
import { Button } from "../../../../../components/ui/button.tsx";
import { Input } from "../../../../../components/ui/input.tsx";
import { Label } from "../../../../../components/ui/label.tsx";
import { vigencia } from "../../../../../lib/consultas.ts";
import { consultanteDesdeEntorno } from "../../../../../lib/supabase.ts";

export default async function Vigencia({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string; numero: string; anio: string }>;
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { tipo, numero, anio } = await params;
  const { fecha } = await searchParams;
  const action = `/vigencia/${encodeURIComponent(tipo)}/${encodeURIComponent(numero)}/${anio}`;

  let resultado: Awaited<ReturnType<typeof vigencia>> | null = null;
  let error: string | null = null;

  try {
    resultado = await vigencia(
      consultanteDesdeEntorno(),
      { tipo, numero, anio: Number(anio) },
      "ficha_individual",
      fecha,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const r = resultado;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {tipo} {numero} de {anio}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Vigencia {fecha ? `a fecha ${fecha}` : "a día de hoy"}.
      </p>

      <Form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="fecha">Consultar a fecha</Label>
          <Input id="fecha" name="fecha" type="date" defaultValue={fecha ?? ""} className="mt-1" />
        </div>
        <Button type="submit">Consultar</Button>
      </Form>

      {error ? (
        <p className="mt-4 text-sm text-destructive">No se pudo consultar: {error}</p>
      ) : null}
      {r?.advertencia ? (
        <div className="mt-4">
          <Avisos advertencia={r.advertencia} />
        </div>
      ) : null}

      {r?.filas.map((f) => (
        <section
          // La fila TIENE identidad: artículo + norma afectante + fecha de
          // efecto. Usar el índice la perdería en cuanto cambiara el orden.
          key={`${String(f.articulo)}|${String(f.norma_afectante)}|${String(f.fecha_efecto)}`}
          className="mt-6 border border-border p-4"
        >
          <h2 className="font-semibold">{String(f.veredicto)}</h2>
          <dl className="mt-3 grid grid-cols-[minmax(8rem,11rem)_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Artículo</dt>
            <dd>{String(f.articulo)}</dd>
            <dt className="text-muted-foreground">Por</dt>
            <dd>{String(f.norma_afectante)}</dd>
            <dt className="text-muted-foreground">Diario Oficial</dt>
            <dd>{String(f.diario_oficial ?? "—")}</dd>
            <dt className="text-muted-foreground">Fecha de efecto</dt>
            <dd>{String(f.fecha_efecto ?? "no determinable")}</dd>
          </dl>
          {/* LA CLÁUSULA ES LA PRUEBA. Se muestra verbatim y en primer plano:
              es lo que permite al lector comprobar la afirmación sin salir. */}
          <blockquote className="mt-4 border-l-4 border-foreground bg-muted px-4 py-3 text-sm">
            {String(f.clausula_prueba)}
          </blockquote>
          <p className="mt-3 text-sm text-muted-foreground">
            Regla aplicada: {String(f.regla_aplicada)}
          </p>
          <p className="mt-1 text-sm">
            {String(f.procedencia)} ·{" "}
            <a
              className="text-primary underline-offset-2 hover:underline"
              href={String(f.verificable_en)}
              rel="noreferrer"
            >
              verificar en la fuente
            </a>
          </p>
        </section>
      ))}
    </>
  );
}
