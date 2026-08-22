import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Button({
  className,
  type = "submit",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "ghost" && "hover:bg-accent hover:text-accent-foreground",
        variant === "outline" && "border border-border bg-background hover:bg-accent",
        className,
      )}
      {...props}
    />
  );
}
