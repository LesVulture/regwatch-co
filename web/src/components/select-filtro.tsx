import { Label } from "./ui/label.tsx";

export function SelectFiltro({
  name,
  label,
  value,
  opciones,
  vacio = "Cualquiera",
}: {
  name: string;
  label: string;
  value: string;
  opciones: readonly { value: string; label: string }[];
  vacio?: string;
}) {
  return (
    <div className="min-w-[10rem] flex-1">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={value}
        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
      >
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
