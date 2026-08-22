import { Suspense } from "react";
import { Avisos } from "../components/avisos.tsx";
import { Conteo } from "../components/conteo.tsx";
import { FormGet } from "../components/form-get.tsx";
import { ListaResultados } from "../components/lista-resultados.tsx";
import { Atajos } from "../components/nav.tsx";
import { hrefConPage, Paginacion } from "../components/paginacion.tsx";
import { SelectFiltro } from "../components/select-filtro.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { ejecutarBusqueda } from "../lib/ejecutar-busqueda.ts";
import { etiquetaOrigen, ORIGENES, parsearSearchParams, queryDeSearch } from "../lib/filtros.ts";

// Next 16: `searchParams` es asíncrono. No hay `proxy.ts`: este app no
// intercepta requests (Context7, Next 16.2: proxy.ts sustituye a middleware
// SOLO cuando hay interceptación). Inventar un proxy vacío para «cumplir
// la convención» sería el mismo teatro que este repo prohíbe.

type Sp = Promise<Record<string, string | string[] | undefined>>;

export default function Inicio({ searchParams }: { searchParams: Sp }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Buscar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Lenguaje natural sobre lo capturado: normas, proyectos de ley del Senado y jurisprudencia de
        la Corte. Un recorte que no aplica a un tipo lo excluye; no lo deja pasar callado.
      </p>
      <Suspense
        fallback={
          <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
            Consultando lo capturado…
          </p>
        }
      >
        <Busqueda searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Busqueda({ searchParams }: { searchParams: Sp }) {
  const sp = await searchParams;
  const f = parsearSearchParams(sp);
  const qs = queryDeSearch(sp);

  let resultado: Awaited<ReturnType<typeof ejecutarBusqueda>>["resultado"] = null;
  let error: string | null = null;
  let sinSemantica: string | null = null;

  if (f.consulta !== "") {
    const r = await ejecutarBusqueda(f.consulta, f.opciones, f.limite);
    resultado = r.resultado;
    error = r.error;
    sinSemantica = r.sinSemantica;
  }

  const n = resultado?.filas.length ?? 0;

  return (
    <>
      <FormGet action="/">
        <div>
          <Label htmlFor="q">Consulta</Label>
          <Input
            id="q"
            name="q"
            defaultValue={f.consulta}
            placeholder="salud mental, inteligencia artificial…"
            aria-label="Buscar en normas, proyectos de ley y jurisprudencia"
            className="mt-1"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <SelectFiltro
            name="tipo"
            label="Tipo"
            value={f.opciones.soloTipo ?? ""}
            opciones={ORIGENES.map((o) => ({ value: o, label: etiquetaOrigen(o) }))}
          />
          <div className="min-w-[8rem]">
            <Label htmlFor="anio">Año</Label>
            <Input
              id="anio"
              name="anio"
              type="number"
              min={1810}
              max={2100}
              defaultValue={f.opciones.anio !== undefined ? String(f.opciones.anio) : ""}
              className="mt-1"
            />
          </div>
        </div>
      </FormGet>
      <Atajos />

      <Avisos
        error={error}
        sinSemantica={sinSemantica}
        advertencia={resultado?.advertencia ?? null}
        avisoFiltro={f.advertencia}
      />

      {f.consulta === "" ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Escribe una consulta o usa un atajo. Los atajos rellenan <code>q=</code>; no son una
          taxonomía de temas.
        </p>
      ) : (
        <>
          <Conteo n={n} />
          {resultado ? <ListaResultados filas={resultado.filas} /> : null}
          <Paginacion
            page={f.page}
            hayMas={resultado?.hay_mas === true}
            hrefPara={(p) => hrefConPage("/", qs, p)}
          />
        </>
      )}
    </>
  );
}
