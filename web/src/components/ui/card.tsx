import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={cn("border-b border-border py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold leading-snug", className)} {...props} />;
}
