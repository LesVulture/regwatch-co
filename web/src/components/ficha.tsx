export function CamposFicha({
  campos,
}: {
  campos: readonly { etiqueta: string; valor: unknown }[];
}) {
  return (
    <dl className="mt-4 grid grid-cols-[minmax(8rem,11rem)_1fr] gap-x-4 gap-y-2 text-sm">
      {campos.map((c) => {
        if (c.valor == null || c.valor === "") return null;
        const texto = Array.isArray(c.valor) ? c.valor.join(", ") : String(c.valor);
        if (texto.trim() === "") return null;
        return (
          <div key={c.etiqueta} className="contents">
            <dt className="text-muted-foreground">{c.etiqueta}</dt>
            <dd>{texto}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function PieProcedencia({
  url,
  capturedAt,
  tier,
}: {
  url: unknown;
  capturedAt: unknown;
  tier: unknown;
}) {
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      <a
        className="text-primary underline-offset-2 hover:underline"
        href={String(url)}
        rel="noreferrer"
      >
        fuente
      </a>
      {" · capturado "}
      {String(capturedAt ?? "").slice(0, 10)}
      {" · tier "}
      {String(tier)}
    </p>
  );
}
