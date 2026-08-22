import { buscar, type OpcionesBusqueda, type ResultadoBusqueda } from "./consultas.ts";
import { embeberConsulta } from "./embedding-consulta.ts";
import { consultanteDesdeEntorno } from "./supabase.ts";

export async function ejecutarBusqueda(
  consulta: string,
  opciones: OpcionesBusqueda,
  limite: number,
): Promise<{
  resultado: ResultadoBusqueda | null;
  sinSemantica: string | null;
  error: string | null;
}> {
  try {
    const { vector, motivo } = await embeberConsulta(consulta);
    const { comision: _comision, ...paraBuscar } = opciones;
    const resultado = await buscar(consultanteDesdeEntorno(), consulta, "api_bloque", limite, {
      ...paraBuscar,
      embedding: vector,
    });
    return { resultado, sinSemantica: motivo, error: null };
  } catch (e) {
    return {
      resultado: null,
      sinSemantica: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
