import { cn } from "@/lib/utils";

/**
 * Esqueleto com varredura em vez de pulsar: o `pulse` padrão pisca a tela
 * inteira e cansa; a varredura lê como leitura de dado em andamento.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "scanning rounded-md bg-[hsl(0_0%_100%/0.04)] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]",
        className,
      )}
      {...props}
    />
  );
}
