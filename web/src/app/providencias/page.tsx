import { Suspense } from "react";
import { Avisos } from "../../components/avisos.tsx";
import { Conteo } from "../../components/conteo.tsx";
import { FormGet } from "../../components/form-get.tsx";
import { ListaResultados } from "../../components/lista-resultados.tsx";
import { hrefConPage, Paginacion } from "../../components/paginacion.tsx";
import { SelectFiltro } from "../../components/select-filtro.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { listarProvidencias, opcionesFiltroProvidencias } from "../../lib/consultas.ts";
import { ejecutarBusqueda } from "../../lib/ejecutar-busqueda.ts";
import { parsearSearchParams, queryDeSearch, TIPOS_PROVIDENCIA } from "../../lib/filtros.ts";
import { consultanteDesdeEntorno } from "../../lib/supabase.ts";

type Sp = Promise<Record<string, string | string[] | undefined>>;

export default function PaginaProvidencias({ searchParams }: { searchParams: Sp }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Jurisprudencia</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Providencias de la Corte Constitucional en lo capturado. El campo «tema» de la fuente es
        prosa libre, no una taxonomía: aquí se recorta por año y tipo.
      </p>
      <Suspense
        fallback={
          <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
            Consultando lo capturado…
          </p>
        }
      >
        <Listado searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Listado({ searchParams }: { searchParams: Sp }) {
  const sp = await searchParams;
  const f = parsearSearchParams({ ...sp, tipo: "providencia" });
  const qs = queryDeSearch({ ...sp, tipo: undefined });

  let anios: number[] = [];
  let tipos: string[] = [...TIPOS_PROVIDENCIA];
  try {
    const vivas = await opcionesFiltroProvidencias(consultanteDesdeEntorno());
    if (vivas.anios.length > 0) anios = vivas.anios;
    if (vivas.tipos.length > 0) tipos = vivas.tipos;
  } catch {
    // Sin base, el formulario sigue con los tipos canónicos.
  }

  let resultado: Awaited<ReturnType<typeof listarProvidencias>> | null = null;
  let error: string | null = null;
  let sinSemantica: string | null = null;

  if (f.consulta !== "") {
    const r = await ejecutarBusqueda(
      f.consulta,
      { ...f.opciones, soloTipo: "providencia" },
      f.limite,
    );
    resultado = r.resultado;
    error = r.error;
    sinSemantica = r.sinSemantica;
  } else {
    try {
      resultado = await listarProvidencias(
        consultanteDesdeEntorno(),
        "api_bloque",
        f.opciones,
        f.limite,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const n = resultado?.filas.length ?? 0;

  return (
    <>
      <FormGet action="/providencias" etiqueta={f.consulta ? "Buscar" : "Filtrar"}>
        <div>
          <Label htmlFor="q">Consulta (opcional)</Label>
          <Input
            id="q"
            name="q"
            defaultValue={f.consulta}
            placeholder="Sin texto: listado por año y tipo"
            className="mt-1"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[8rem]">
            <Label htmlFor="anio">Año de publicación</Label>
            <Input
              id="anio"
              name="anio"
              type="number"
              min={1810}
              max={2100}
              list="anios-prov"
              defaultValue={f.opciones.anio !== undefined ? String(f.opciones.anio) : ""}
              className="mt-1"
            />
            {anios.length > 0 ? (
              <datalist id="anios-prov">
                {anios.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            ) : null}
          </div>
          <SelectFiltro
            name="tipo_providencia"
            label="Tipo de providencia"
            value={f.opciones.tipoProvidencia ?? ""}
            opciones={tipos.map((v) => ({ value: v, label: v }))}
          />
        </div>
      </FormGet>

      <Avisos
        error={error}
        sinSemantica={sinSemantica}
        advertencia={resultado?.advertencia ?? null}
        avisoFiltro={f.consulta ? null : f.advertencia}
      />

      <Conteo n={n} />
      {resultado ? <ListaResultados filas={resultado.filas} /> : null}
      <Paginacion
        page={f.page}
        hayMas={resultado?.hay_mas === true}
        hrefPara={(p) => hrefConPage("/providencias", qs, p)}
      />
    </>
  );
}
