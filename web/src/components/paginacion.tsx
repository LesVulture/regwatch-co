export function hrefConPage(path: string, params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const q = next.toString();
  return q ? `${path}?${q}` : path;
}

export function Paginacion({
  page,
  hayMas,
  hrefPara,
}: {
  page: number;
  hayMas: boolean;
  hrefPara: (p: number) => string;
}) {
  if (page <= 1 && !hayMas) return null;
  return (
    <nav className="mt-6 flex gap-3" aria-label="Paginación">
      {page > 1 ? (
        <a
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          href={hrefPara(page - 1)}
        >
          Anterior
        </a>
      ) : null}
      {hayMas ? (
        <a
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          href={hrefPara(page + 1)}
        >
          Siguiente
        </a>
      ) : null}
    </nav>
  );
}
