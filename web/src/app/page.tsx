import { buscar } from "../lib/consultas.ts";
import { embeberConsulta } from "../lib/embedding-consulta.ts";
import { consultanteDesdeEntorno } from "../lib/supabase.ts";

// Next 16: `searchParams` es asíncrono. Es una de las dos convenciones que un
// greenfield adopta de nacimiento (la otra es `proxy.ts` en vez de middleware).
export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;

  let resultado: Awaited<ReturnType<typeof buscar>> | null = null;
  let error: string | null = null;
  let sinSemantica: string | null = null;

  if (q.trim() !== "") {
    try {
      // El vector se pide ANTES y por separado: si Ollama no está, `embeberConsulta`
      // devuelve null con su motivo y `hybrid_search` degrada a la búsqueda léxica
      // sin error. Lo que no se hace es callarlo — la mitad semántica apagada cambia
      // qué resultados existen, no solo su orden.
      const { vector, motivo } = await embeberConsulta(q);
      sinSemantica = motivo;
      // `api_bloque`: se devuelven varias filas, así que la política de egreso
      // aplica su criterio de bloque. NO es `ficha_individual`.
      resultado = await buscar(consultanteDesdeEntorno(), q, "api_bloque", 20, {
        embedding: vector,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <form style={{ margin: "1.5rem 0" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="salud mental, inteligencia artificial…"
          aria-label="Buscar en normas, proyectos de ley y jurisprudencia"
          style={{ width: "70%", padding: ".5rem", fontSize: "1rem" }}
        />
        <button type="submit" style={{ padding: ".5rem 1rem", marginLeft: ".5rem" }}>
          Buscar
        </button>
      </form>

      {error && <p style={{ color: "#a00" }}>No se pudo consultar: {error}</p>}

      {sinSemantica && (
        <p style={{ fontSize: ".8rem", color: "#666" }}>
          Solo búsqueda léxica en esta consulta: {sinSemantica}. Los resultados que únicamente
          encontraría el vector no aparecen.
        </p>
      )}

      {resultado?.advertencia && (
        <p style={{ background: "#fff8e1", padding: ".75rem", borderLeft: "3px solid #f5a623" }}>
          {resultado.advertencia}
        </p>
      )}

      {resultado?.filas.map((f) => (
        <article key={String(f.id)} style={{ borderBottom: "1px solid #eee", padding: "1rem 0" }}>
          <div style={{ fontSize: ".8rem", color: "#666" }}>
            {String(f.origen)} · {String(f.referencia ?? "")}
            {f.estado ? ` · ${String(f.estado)}` : ""}
            {f.posicion_semantica != null && f.posicion_lexica == null
              ? " · lo encontró el vector"
              : ""}
          </div>
          <div style={{ fontWeight: 600, margin: ".25rem 0" }}>
            {String(f.titulo ?? "(sin título)")}
          </div>
          {/* La procedencia se muestra SIEMPRE, no en un desplegable: un
              resultado sin fuente visible invita a citarlo sin comprobarlo. */}
          <div style={{ fontSize: ".8rem" }}>
            <a href={String(f.url_fuente)} rel="noreferrer">
              fuente
            </a>{" "}
            · capturado {String(f.captured_at ?? "").slice(0, 10)} · tier {String(f.tier)}
          </div>
        </article>
      ))}
    </>
  );
}
