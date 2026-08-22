export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">No encontrado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Esa ruta no existe en esta app. Prueba la{" "}
        <a className="text-primary underline" href="/">
          búsqueda
        </a>
        ,{" "}
        <a className="text-primary underline" href="/proyectos">
          proyectos
        </a>{" "}
        o{" "}
        <a className="text-primary underline" href="/cobertura">
          cobertura
        </a>
        .
      </p>
    </main>
  );
}
