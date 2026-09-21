import * as React from "react";
import { cn } from "@/lib/utils";
import { STAGES, type Stage } from "@/lib/types";

/**
 * Peças de moldura repetidas em toda tela.
 *
 * O padrão de cada página é sempre o mesmo: um índice mono numerado, um
 * título em serif de display e uma régua que fecha o bloco. A repetição é
 * o que faz a navegação parecer um instrumento e não um site.
 */

export function PageHeader({
  title,
  description,
  action,
  accent,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Cor do fio de abertura quando a página pertence a uma área. */
  accent?: string;
}) {
  return (
    <header className="relative">
      {/* Fio curto acima do título no lugar do rótulo que existia aqui.
          O carimbo "01 / FLUXO" não dizia nada que o título já não diga, e a
          navegação à esquerda já informa onde você está. */}
      <span
        aria-hidden
        className="block h-[2px] w-10 rounded-full"
        style={{ background: accent ?? "hsl(var(--acid))" }}
      />

      {/* No celular o botão desce: dividir 390px entre título e ação espremia o
          título em três linhas com órfã. A partir de sm eles voltam a dividir
          a linha. */}
      <div className="mt-5 flex flex-col items-start gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-8">
        <div className="w-full min-w-0 sm:flex-1">
          <h1 className="display max-w-2xl text-balance text-foreground">{title}</h1>

          {description && (
            <p className="mt-4 max-w-[62ch] text-pretty text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>

      <div className="rule mt-8" />
    </header>
  );
}

export function SectionHeader({
  label,
  count,
  action,
  className,
}: {
  label: string;
  count?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-center gap-4", className)}>
      <h2 className="label shrink-0">{label}</h2>
      {/* A linha ocupa a folga entre rótulo e valor: costura tipográfica. */}
      <span aria-hidden className="h-px min-w-6 flex-1 bg-[hsl(0_0%_100%/0.08)]" />
      {count !== undefined && <span className="datum shrink-0">{count}</span>}
      {action}
    </div>
  );
}

/**
 * Estado vazio.
 *
 * Nunca só descreve o que apareceria aqui: recebe uma ação e a coloca dentro.
 * Um vazio que não faz nada acontecer é o que fazia o app parecer morto.
 */
export function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-empty animate-scale-in px-6 py-12 text-center md:py-16">
      {Icon && (
        <div className="relative mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-[hsl(0_0%_100%/0.03)] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)]">
          <Icon className="h-4 w-4 animate-breathe text-muted-foreground" />
        </div>
      )}

      <p className="font-display text-2xl tracking-tightest">{title}</p>

      {children && (
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          {children}
        </p>
      )}

      {action && <div className="mt-7 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Número grande com rótulo mono — usado nos painéis de estado. */
export function Metric({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "acid" | "plasma" | "ember" | "muted";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    acid: "text-acid",
    plasma: "text-plasma",
    ember: "text-ember",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <div className={cn("min-w-0", className)}>
      <p className="label text-muted-foreground">{label}</p>
      <p className={cn("numeral mt-2.5", toneClass)} data-numeric>
        {value}
      </p>
      {hint && <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Selo de estágio.
 *
 * A cor não é decorativa: é a mesma escala do ciclo inteiro, de ember
 * (semente crua) a ácido (enraizado). Quem aprende a ler o selo sabe o estado
 * do item sem ler uma palavra.
 */
export function StageBadge({
  stage,
  className,
  showLabel = true,
}: {
  stage: Stage;
  className?: string;
  showLabel?: boolean;
}) {
  const meta = STAGES[stage] ?? STAGES.seed;

  return (
    <span
      title={meta.hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium leading-[1.4]",
        className,
      )}
      style={{
        color: `hsl(${meta.tone})`,
        backgroundColor: `hsl(${meta.tone} / 0.1)`,
        boxShadow: `inset 0 0 0 1px hsl(${meta.tone} / 0.26)`,
      }}
    >
      <StageGlyph stage={stage} />
      {showLabel && meta.label}
    </span>
  );
}

/**
 * Glifo do estágio: um ponto que ganha anéis conforme amadurece.
 *
 * Ícone literal (semente, broto, árvore) ficaria infantil ao lado de uma
 * interface de painel. Anéis concêntricos dizem a mesma coisa em 10px.
 */
export function StageGlyph({ stage, className }: { stage: Stage; className?: string }) {
  const rings = { seed: 0, sprout: 1, grown: 2, rooted: 3, dormant: 0 }[stage] ?? 0;

  return (
    <svg
      viewBox="0 0 12 12"
      className={cn("h-2.5 w-2.5 shrink-0", className)}
      fill="none"
      aria-hidden
    >
      <circle cx="6" cy="6" r="1.6" fill="currentColor" />
      {Array.from({ length: rings }, (_, i) => (
        <circle
          key={i}
          cx="6"
          cy="6"
          r={2.6 + i * 1.7}
          stroke="currentColor"
          strokeWidth="0.8"
          opacity={0.75 - i * 0.18}
        />
      ))}
      {stage === "dormant" && (
        <line x1="2" y1="10" x2="10" y2="2" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      )}
    </svg>
  );
}

/**
 * Medidor de força.
 *
 * `strength` é o valor guardado; `vitality` é o que sobrou dele depois do
 * esquecimento. Mostrar os dois juntos — barra cheia fantasma e barra viva —
 * é o que torna o decaimento visível em vez de teórico.
 */
export function Vitality({
  value,
  base,
  tone,
  className,
}: {
  value: number;
  base?: number;
  tone?: string;
  className?: string;
}) {
  const ghost = Math.max(value, base ?? value);

  return (
    <span
      className={cn("meter", className)}
      style={{ "--tone": tone ?? "var(--acid)" } as React.CSSProperties}
      role="img"
      aria-label={`Força ${value} de 100`}
    >
      {ghost > value && (
        <span
          className="absolute inset-y-0 left-0 rounded-full opacity-25"
          style={{ width: `${ghost}%`, background: `hsl(${tone ?? "var(--acid)"})` }}
        />
      )}
      <span style={{ width: `${Math.max(2, value)}%` }} />
    </span>
  );
}
