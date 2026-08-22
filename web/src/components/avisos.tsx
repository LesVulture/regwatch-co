import { Alert } from "./ui/alert.tsx";

export function Avisos({
  error,
  sinSemantica,
  advertencia,
  avisoFiltro,
}: {
  error?: string | null;
  sinSemantica?: string | null;
  advertencia?: string | null;
  avisoFiltro?: string | null;
}) {
  return (
    <>
      {error ? <Alert tone="error">No se pudo consultar: {error}</Alert> : null}
      {sinSemantica ? (
        <Alert tone="info" className="mt-3">
          Solo búsqueda léxica en esta consulta: {sinSemantica}. Los resultados que únicamente
          encontraría el vector no aparecen.
        </Alert>
      ) : null}
      {avisoFiltro ? (
        <Alert tone="info" className="mt-3">
          {avisoFiltro}
        </Alert>
      ) : null}
      {advertencia ? <Alert className="mt-3">{advertencia}</Alert> : null}
    </>
  );
}
