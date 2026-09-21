"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

/**
 * Fita de 3px sobre trilho afundado. A hachura diagonal dentro da barra
 * marca movimento sem animação contínua — a textura já sugere deslocamento.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-[3px] w-full overflow-hidden rounded-full bg-[hsl(0_0%_100%/0.07)]",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="tape h-full w-full flex-1 rounded-full bg-acid shadow-[0_0_12px_hsl(var(--acid)/0.6)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
