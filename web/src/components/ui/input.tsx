import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-base",
        "placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
