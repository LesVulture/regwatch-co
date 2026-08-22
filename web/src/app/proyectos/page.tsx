import { Suspense } from "react";
import { Avisos } from "../../components/avisos.tsx";
import { Conteo } from "../../components/conteo.tsx";
import { FormGet } from "../../components/form-get.tsx";
import { ListaResultados } from "../../components/lista-resultados.tsx";
import { hrefConPage, Paginacion } from "../../components/paginacion.tsx";
import { SelectFiltro } from "../../components/select-filtro.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { listarProyectos, opcionesFiltroProyectos } from "../../lib/consultas.ts";
import { ejecutarBusqueda } from "../../lib/ejecutar-busqueda.ts";
import {
  avisoComisionEnBusqueda,
  CAMARAS,
  ESTADOS_TRAMITE,
  etiquetaCamara,
  etiquetaEstado,
  parsearSearchParams,
  queryDeSearch,
} from "../../lib/filtros.ts";
import { consultanteDesdeEntorno } from "../../lib/supabase.ts";

type Sp = Promise<Record<string, string | string[] | undefined>>;

const LEGISLATURAS_CONOCIDAS = ["2022-2023", "2023-2024", "2024-2025", "2025-2026", "2026-2027"];

export default function PaginaProyectos({ searchParams }: { searchParams: Sp }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Proyectos de ley</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Corpus del Senado. El recorte de cámara es{" "}
        <strong className="font-medium text-foreground">cámara del trámite según el Senado</strong>,
        no proyectos de la Cámara de Representantes (esa fuente está gated).
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
  const f = parsearSearchParams({ ...sp, tipo: "proyecto_ley" });
  const qs = queryDeSearch({ ...sp, tipo: undefined });
  const avisoComision = avisoComisionEnBusqueda(f.opciones.comision, f.consulta !== "");

  let facetas: {
    legislaturas: string[];
    estados: string[];
    camaras: string[];
    comisiones: string[];
  } = {
    legislaturas: [...LEGISLATURAS_CONOCIDAS],
    estados: [...ESTADOS_TRAMITE],
    camaras: [...CAMARAS],
    comisiones: [],
  };
  try {
    const vivas = await opcionesFiltroProyectos(consultanteDesdeEntorno());
    if (vivas.legislaturas.length > 0) facetas = { ...facetas, ...vivas };
    else facetas = { ...facetas, comisiones: vivas.comisiones };
  } catch {
    // Sin base se rellenan los valores canónicos; el listado fallirá aparte.
  }

  let resultado: Awaited<ReturnType<typeof listarProyectos>> | null = null;
  let error: string | null = null;
  let sinSemantica: string | null = null;

  if (f.consulta !== "") {
    const r = await ejecutarBusqueda(
      f.consulta,
      { ...f.opciones, soloTipo: "proyecto_ley" },
      f.limite,
    );
    resultado = r.resultado;
    error = r.error;
    sinSemantica = r.sinSemantica;
  } else {
    try {
      resultado = await listarProyectos(
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
      <FormGet action="/proyectos" etiqueta={f.consulta ? "Buscar" : "Filtrar"}>
        <div>
          <Label htmlFor="q">Consulta (opcional)</Label>
          <Input
            id="q"
            name="q"
            defaultValue={f.consulta}
            placeholder="Sin texto: listado por facetas"
            className="mt-1"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <SelectFiltro
            name="legislatura"
            label="Legislatura"
            value={f.opciones.legislatura ?? ""}
            opciones={facetas.legislaturas.map((v) => ({ value: v, label: v }))}
          />
          <SelectFiltro
            name="estado"
            label="Estado de trámite"
            value={f.opciones.estado ?? ""}
            opciones={facetas.estados.map((v) => ({ value: v, label: etiquetaEstado(v) }))}
          />
          <SelectFiltro
            name="camara"
            label="Cámara del trámite (fuente Senado)"
            value={f.opciones.camara ?? ""}
            opciones={facetas.camaras.map((v) => ({ value: v, label: etiquetaCamara(v) }))}
          />
          {facetas.comisiones.length > 0 ? (
            <SelectFiltro
              name="comision"
              label="Comisión"
              value={f.opciones.comision ?? ""}
              opciones={facetas.comisiones.map((v) => ({ value: v, label: v }))}
            />
          ) : null}
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

      <Avisos
        error={error}
        sinSemantica={sinSemantica}
        advertencia={resultado?.advertencia ?? null}
        avisoFiltro={
          [avisoComision, f.consulta ? null : f.advertencia].filter(Boolean).join(" ") || null
        }
      />

      <Conteo n={n} />
      {resultado ? <ListaResultados filas={resultado.filas} /> : null}
      <Paginacion
        page={f.page}
        hayMas={resultado?.hay_mas === true}
        hrefPara={(p) => hrefConPage("/proyectos", qs, p)}
      />
    </>
  );
}
