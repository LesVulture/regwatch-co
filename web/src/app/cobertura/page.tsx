export default function Cobertura() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Cobertura</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Qué hay en lo capturado y qué no. No es un tablero de marketing: es la declaración que pide
        el contrato de evidencia.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Qué se puede consultar</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          Proyectos de ley del <strong>Senado</strong> (cinco legislaturas en el corpus cargado).
        </li>
        <li>Providencias de la Corte Constitucional (relatoría).</li>
        <li>
          <strong>7 normas con articulado</strong> (8 filas en <code>norma</code>: la Ley 2460 de
          2025 está como afectante, sin texto).
        </li>
        <li>Vigencia a fecha arbitraria, con la cláusula verbatim de la norma afectante.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Qué no está</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          <strong>Cámara de Representantes:</strong> el colector existe con{" "}
          <code>AUTORIZACION.concedida = false</code>. Un filtro «cámara» en proyectos es la cámara
          del trámite <em>según el Senado</em>, no el corpus de la Cámara.
        </li>
        <li>
          CONPES, DNP, Función Pública, prensa. No hay tabla <code>tema</code> ni clasificador de 45
          temas: los atajos de la portada rellenan <code>q=</code>.
        </li>
        <li>
          Timeline de trámite: no existe <code>tramite_evento</code>. Las fichas muestran los campos
          que hay (estado, comisión, crosswalk), no una línea de tiempo inventada.
        </li>
        <li>
          Chat de Q&A en esta interfaz. El gold set del 2026-08-20 publicó 1 de 18 preguntas; una
          caja de chat fingiría cobertura que el articulado no tiene. El Q&A vive en{" "}
          <code>pnpm qa</code>.
        </li>
        <li>
          Totales. La búsqueda y el MCP devuelven filas y un <code>hay_mas</code>, no un conteo del
          corpus.
        </li>
      </ul>

      <p className="mt-8 text-sm text-muted-foreground">
        El mapa as-built está en el repositorio, en <code>docs/ESTADO.md</code>.
      </p>
    </>
  );
}
