import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Etiquetas são dado, não enfeite: mono, caixa-alta, cantos retos.
 * O raio arredondado foi de propósito descartado — pílula lê como tag de
 * blog, retângulo lê como etiqueta de instrumento.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase leading-[1.4] tracking-[0.1em] [&_svg]:size-2.5",
  {
    variants: {
      variant: {
        default: "bg-[hsl(var(--acid)/0.12)] text-acid shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.28)]",
        plasma:
          "bg-[hsl(var(--plasma)/0.1)] text-plasma shadow-[inset_0_0_0_1px_hsl(var(--plasma)/0.26)]",
        ember:
          "bg-[hsl(var(--ember)/0.1)] text-ember shadow-[inset_0_0_0_1px_hsl(var(--ember)/0.26)]",
        secondary: "bg-[hsl(var(--surface-raised))] text-secondary-foreground",
        outline: "text-foreground shadow-[inset_0_0_0_1px_currentColor]",
        muted:
          "bg-[hsl(0_0%_100%/0.04)] text-muted-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
