import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full rounded-md bg-[hsl(var(--surface-sunken))] px-3 py-2.5 text-base leading-relaxed text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08),inset_0_1px_2px_hsl(0_0%_0%/0.4)] transition-shadow duration-200 placeholder:text-muted-foreground/70 focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.7),0_0_0_3px_hsl(var(--acid)/0.12)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
