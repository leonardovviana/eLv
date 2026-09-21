"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Quadrado reto, sem raio: casa com o grid e com as etiquetas mono. */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-5 w-5 shrink-0 rounded-[3px] bg-[hsl(var(--surface-sunken))] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.16)] transition-all duration-200 hover:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.5)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-acid data-[state=checked]:text-acid-foreground data-[state=checked]:shadow-[0_0_0_1px_hsl(var(--acid)/0.6),0_0_16px_-2px_hsl(var(--acid)/0.55)]",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
