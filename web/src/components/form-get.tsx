import Form from "next/form";
import type { ReactNode } from "react";
import { Button } from "./ui/button.tsx";

/** GET con `next/form`: los filtros viven en la URL, compartibles, sin SPA. */
export function FormGet({
  action,
  children,
  etiqueta = "Buscar",
}: {
  action: string;
  children: ReactNode;
  etiqueta?: string;
}) {
  return (
    <Form action={action} className="mt-4 space-y-3">
      {children}
      <Button type="submit">{etiqueta}</Button>
    </Form>
  );
}
