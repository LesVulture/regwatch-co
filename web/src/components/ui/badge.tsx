import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
