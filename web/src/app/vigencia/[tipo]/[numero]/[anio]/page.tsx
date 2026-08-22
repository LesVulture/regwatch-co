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
      <h2>
        {tipo} {numero} de {anio}
      </h2>
      <p style={{ color: "#555" }}>Vigencia {fecha ? `a fecha ${fecha}` : "a día de hoy"}.</p>

      {error && <p style={{ color: "#a00" }}>No se pudo consultar: {error}</p>}

      {r?.advertencia && (
        <p style={{ background: "#fff8e1", padding: ".75rem", borderLeft: "3px solid #f5a623" }}>
          {r.advertencia}
        </p>
      )}

      {r?.filas.map((f) => (
        <section
          // La fila TIENE identidad: artículo + norma afectante + fecha de
          // efecto. Usar el índice la perdería en cuanto cambiara el orden.
          key={`${String(f.articulo)}|${String(f.norma_afectante)}|${String(f.fecha_efecto)}`}
          style={{ border: "1px solid #ddd", padding: "1rem", margin: "1rem 0" }}
        >
          <div style={{ fontWeight: 600 }}>{String(f.veredicto)}</div>
          <dl style={{ display: "grid", gridTemplateColumns: "10rem 1fr", gap: ".25rem 1rem" }}>
            <dt>Artículo</dt>
            <dd>{String(f.articulo)}</dd>
            <dt>Por</dt>
            <dd>{String(f.norma_afectante)}</dd>
            <dt>Diario Oficial</dt>
            <dd>{String(f.diario_oficial ?? "—")}</dd>
            <dt>Fecha de efecto</dt>
            <dd>{String(f.fecha_efecto ?? "no determinable")}</dd>
          </dl>
          {/* LA CLÁUSULA ES LA PRUEBA. Se muestra verbatim y en primer plano:
              es lo que permite al lector comprobar la afirmación sin salir. */}
          <blockquote
            style={{
              borderLeft: "3px solid #333",
              margin: "1rem 0",
              padding: ".5rem 1rem",
              background: "#fafafa",
            }}
          >
            {String(f.clausula_prueba)}
          </blockquote>
          <div style={{ fontSize: ".8rem", color: "#555" }}>
            Regla aplicada: {String(f.regla_aplicada)}
          </div>
          <div style={{ fontSize: ".8rem" }}>
            {String(f.procedencia)} ·{" "}
            <a href={String(f.verificable_en)} rel="noreferrer">
              verificar en la fuente
            </a>
          </div>
        </section>
      ))}
    </>
  );
}
