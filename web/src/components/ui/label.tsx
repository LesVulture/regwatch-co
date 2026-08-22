import type { LabelHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Label({
  className,
  htmlFor,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-sm font-medium text-foreground", className)}
      {...props}
    >
      {children}
    </label>
  );
}
