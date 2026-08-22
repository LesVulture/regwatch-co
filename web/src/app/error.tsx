"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">No se pudo consultar</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message || "Error al hablar con la base."}
      </p>
      <button
        type="button"
        className="mt-4 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        onClick={() => reset()}
      >
        Reintentar
      </button>
    </main>
  );
}
