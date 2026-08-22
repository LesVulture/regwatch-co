import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Alert({
  className,
  tone = "warn",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "warn" | "error" | "info" }) {
  return (
    <div
      role="status"
      className={cn(
        "border-l-4 px-3 py-2 text-sm",
        tone === "warn" && "border-l-amber-700 bg-amber-50 text-foreground",
        tone === "error" && "border-l-destructive bg-red-50 text-destructive",
        tone === "info" && "border-l-primary bg-accent text-foreground",
        className,
      )}
      {...props}
    />
  );
}
