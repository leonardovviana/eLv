import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Campos são rebaixados, não elevados: o fundo afunda abaixo da superfície e
 * a hairline superior simula a sombra de uma abertura. No foco, a aresta
 * inteira acende em ácido — sem anel externo, que brigaria com o grid.
 *
 * `text-base` no mobile não é estilo, é defesa: abaixo de 16px o iOS dá zoom
 * no campo ao focar e desalinha a tela inteira.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md bg-[hsl(var(--surface-sunken))] px-3 py-2 text-base text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08),inset_0_1px_2px_hsl(0_0%_0%/0.4)] transition-shadow duration-200 placeholder:text-muted-foreground/70 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.7),0_0_0_3px_hsl(var(--acid)/0.12)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
