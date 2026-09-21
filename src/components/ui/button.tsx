import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Toda ação do app fala em mono caixa-alta — é o registro de painel de
 * instrumento, e separa comando de texto corrido sem precisar de ícone.
 *
 * O primário é a única superfície ácida sólida da interface. Se houver dois
 * na mesma tela, um deles está errado.
 */
const buttonVariants = cva(
  // `disabled:shadow-none` é o que impede o primário desativado de continuar
  // irradiando o brilho ácido, que leria como botão ativo.
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-[background-color,box-shadow,color,transform] duration-200 disabled:pointer-events-none disabled:bg-[hsl(0_0%_100%/0.04)] disabled:text-muted-foreground disabled:opacity-70 disabled:shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)] [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-acid text-acid-foreground shadow-[0_0_0_1px_hsl(var(--acid)/0.5),0_10px_30px_-12px_hsl(var(--acid)/0.55)] hover:bg-[hsl(var(--acid)/0.88)] hover:shadow-[0_0_0_1px_hsl(var(--acid)/0.6),0_14px_38px_-12px_hsl(var(--acid)/0.7)] active:translate-y-px",
        plasma:
          "bg-[hsl(var(--plasma)/0.12)] text-plasma shadow-[inset_0_0_0_1px_hsl(var(--plasma)/0.35)] hover:bg-[hsl(var(--plasma)/0.18)] hover:shadow-[inset_0_0_0_1px_hsl(var(--plasma)/0.55)] active:translate-y-px",
        outline:
          "bg-transparent text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.1)] hover:bg-[hsl(var(--surface-raised))] hover:shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.18)] active:translate-y-px",
        secondary:
          "bg-[hsl(var(--surface-raised))] text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)] hover:bg-[hsl(222_14%_12%)] active:translate-y-px",
        ghost:
          "text-muted-foreground hover:bg-[hsl(var(--surface-raised))] hover:text-foreground",
        destructive:
          "bg-[hsl(var(--destructive)/0.1)] text-destructive shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.3)] hover:bg-[hsl(var(--destructive)/0.18)]",
        link: "text-acid underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[10px]",
        lg: "h-12 px-6 text-xs",
        icon: "h-9 w-9 px-0",
        "icon-sm": "h-8 w-8 px-0 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
