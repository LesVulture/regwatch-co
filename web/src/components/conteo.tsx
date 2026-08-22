export function Conteo({ n }: { n: number }) {
  return (
    <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
      {n} resultado{n === 1 ? "" : "s"} en lo capturado
    </p>
  );
}
