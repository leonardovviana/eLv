"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";
import { plantGarden } from "@/lib/actions/cycle";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/motion";
import { STAGES, type ActivityDay, type Pulse, type Stage } from "@/lib/types";

/**
 * Anel de vitalidade — o batimento do cérebro.
 *
 * SVG e não canvas: são dois arcos e um número, e o SVG escala em qualquer
 * densidade de tela sem código de redimensionamento. O traço é desenhado com
 * `stroke-dasharray`, animado por transição de `stroke-dashoffset` — a GPU
 * cuida disso sozinha, sem um quadro sequer de JavaScript.
 */
export function PulseRing({
  value,
  label,
  caption,
  size = 168,
}: {
  value: number;
  label: string;
  caption?: string;
  size?: number;
}) {
  const stroke = 3;
  const r = (size - stroke) / 2 - 8;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);

  const tone = value >= 55 ? "var(--acid)" : value >= 30 ? "var(--plasma)" : "var(--ember)";

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        {/* Trilho */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(0 0% 100% / 0.06)"
          strokeWidth={stroke}
        />
        {/* Arco vivo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`hsl(${tone})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="animate-ring-draw"
          style={
            {
              // O traço cresce por keyframe, do vazio até o valor. Fazer isso com
              // um estado "montado" custava um render inteiro só para disparar
              // uma transição que o CSS dispara sozinho.
              "--ring-len": circumference,
              "--ring-off": offset,
              filter: `drop-shadow(0 0 7px hsl(${tone} / 0.45))`,
            } as React.CSSProperties
          }
        />
        {/* Escala fixa. Na versão anterior ela girava devagar, e girar a
            escala de um instrumento é o oposto do que uma escala faz: ela é
            a referência parada contra a qual o ponteiro se move. */}
        <g>
          {Array.from({ length: 40 }, (_, i) => {
            const angle = (i / 40) * Math.PI * 2;
            const major = i % 10 === 0;
            const inner = r - 9;
            const outer = r - (major ? 16 : 12);
            return (
              <line
                key={i}
                x1={size / 2 + Math.cos(angle) * inner}
                y1={size / 2 + Math.sin(angle) * inner}
                x2={size / 2 + Math.cos(angle) * outer}
                y2={size / 2 + Math.sin(angle) * outer}
                stroke="hsl(0 0% 100% / 0.14)"
                strokeWidth="1"
              />
            );
          })}
        </g>

        {/* Ponteiro: marca o valor na escala. É o que transforma o anel num
            mostrador em vez de uma barra de progresso enrolada. */}
        <line
          x1={size / 2 + Math.cos((value / 100) * Math.PI * 2) * (r + 5)}
          y1={size / 2 + Math.sin((value / 100) * Math.PI * 2) * (r + 5)}
          x2={size / 2 + Math.cos((value / 100) * Math.PI * 2) * (r + 11)}
          y2={size / 2 + Math.sin((value / 100) * Math.PI * 2) * (r + 11)}
          stroke={`hsl(${tone})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          className="animate-fade-in"
          style={{ animationDelay: "1.2s" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp
          value={value}
          className="numeral text-foreground"
          format={(n) => String(n)}
        />
        <p className="label mt-2" style={{ color: `hsl(${tone})` }}>
          {label}
        </p>
        {caption && (
          <p className="mt-1 max-w-[9rem] text-center text-[11px] leading-tight text-muted-foreground">
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Distribuição por estágio.
 *
 * Uma barra só, segmentada, em vez de quatro números soltos: o que importa é
 * a PROPORÇÃO — um cérebro saudável tem poucas sementes e muita raiz. Quatro
 * contadores lado a lado escondem exatamente isso.
 */
export function StageBar({ pulse }: { pulse: Pulse }) {
  // `alpha` separa crescido de enraizado sem inventar uma quarta cor: os dois
  // são ácido, e a saturação é que conta a maturidade. Com alfa quase igual,
  // como estava, as duas faixas viravam uma só aos olhos.
  const parts: { stage: Stage; n: number; alpha: number }[] = [
    { stage: "seed", n: pulse.seeds, alpha: 0.9 },
    { stage: "sprout", n: pulse.sprouts, alpha: 0.9 },
    { stage: "grown", n: pulse.grown, alpha: 0.5 },
    { stage: "rooted", n: pulse.rooted, alpha: 1 },
  ];

  const total = Math.max(1, parts.reduce((sum, p) => sum + p.n, 0));

  return (
    <div>
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-[hsl(0_0%_100%/0.05)]">
        {parts.map(({ stage, n, alpha }, i) => (
          <span
            key={stage}
            className="h-full origin-left animate-[grow-x_1s_cubic-bezier(0.16,1,0.3,1)_both] first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(n / total) * 100}%`,
              backgroundColor: `hsl(${STAGES[stage].tone} / ${alpha})`,
              animationDelay: `${i * 110}ms`,
            }}
            title={`${STAGES[stage].label}: ${n}`}
          />
        ))}
      </div>

      {/* O número fica colado no rótulo. Empurrado para a direita da célula,
          como estava, ele acabava mais perto do próximo estágio do que do
          seu. */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {parts.map(({ stage, n, alpha }) => (
          <div key={stage} className="flex min-w-0 items-baseline gap-2">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full"
              style={{ backgroundColor: `hsl(${STAGES[stage].tone} / ${alpha})` }}
            />
            <dt className="truncate text-[13px] text-muted-foreground">
              {STAGES[stage].label}
            </dt>
            <dd
              className="font-mono text-[13px] tabular-nums"
              style={{ color: `hsl(${STAGES[stage].tone} / ${Math.max(alpha, 0.75)})` }}
            >
              {n}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Atividade dos últimos dias.
 *
 * Duas séries na mesma coluna: o que entrou (captura) e o que voltou
 * (revisão). Ver as duas juntas mostra o desequilíbrio que mata um segundo
 * cérebro, capturar todo dia e nunca revisar.
 *
 * O desenho é de instrumento, não de dashboard: colunas finas sobre uma
 * hairline de base, dia sem nada vira um traço no lugar de um buraco, e hoje
 * ganha marca. A legenda de cada coluna aparece no hover por CSS, sem estado
 * no React e sem o balão amarelo do browser.
 */
export function ActivityStrip({ days }: { days: ActivityDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.captures + d.reviews));
  const totalCaptures = days.reduce((sum, d) => sum + d.captures, 0);
  const totalReviews = days.reduce((sum, d) => sum + d.reviews, 0);

  return (
    <div>
      <div className="flex items-end gap-[2px] sm:gap-[3px]" style={{ height: 96 }}>
        {days.map((d, i) => {
          const total = d.captures + d.reviews;
          const isToday = i === days.length - 1;
          const height = total === 0 ? 0 : Math.max(8, (total / max) * 100);

          return (
            <div
              key={d.day}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              {total === 0 ? (
                // Dia vazio não é ausência de dado, é um dado: um traço na
                // base diz "passou e não aconteceu nada".
                <span className="mx-auto h-px w-full max-w-[6px] bg-[hsl(0_0%_100%/0.14)]" />
              ) : (
                <span
                  className="mx-auto flex w-full max-w-[7px] origin-bottom flex-col justify-end overflow-hidden rounded-t-[2px]"
                  style={{
                    height: `${height}%`,
                    animation: `grow-y 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 20}ms both`,
                  }}
                >
                  {d.reviews > 0 && (
                    <span
                      className="w-full rounded-t-[2px] bg-acid"
                      style={{ height: `${(d.reviews / total) * 100}%` }}
                    />
                  )}
                  {d.captures > 0 && (
                    <span
                      className="w-full bg-[hsl(var(--plasma)/0.45)]"
                      style={{ height: `${(d.captures / total) * 100}%` }}
                    />
                  )}
                </span>
              )}

              {/* Legenda do dia, só no hover, posicionada acima da coluna. */}
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[hsl(var(--popover))] px-2 py-1 text-[11px] text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.1)] group-hover:block">
                {formatDay(d.day)}
                <span className="ml-2 font-mono tabular-nums text-plasma">{d.captures}</span>
                <span className="ml-1.5 font-mono tabular-nums text-acid">{d.reviews}</span>
              </span>

              {isToday && (
                <span
                  aria-hidden
                  className="absolute -bottom-[7px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-acid"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Base: a hairline é o eixo. Uma caixa em volta do gráfico seria mais
          um retângulo numa tela que já tem vários. */}
      <div className="mt-2 h-px w-full bg-[hsl(0_0%_100%/0.09)]" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>{days.length} dias</span>

        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-[2px] bg-[hsl(var(--plasma)/0.45)]" />
            capturas
            <span className="font-mono tabular-nums text-foreground/70">{totalCaptures}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-[2px] bg-acid" />
            revisões
            <span className="font-mono tabular-nums text-foreground/70">{totalReviews}</span>
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * Plantar o acervo de partida.
 *
 * O botão só existe enquanto o cérebro está vazio: depois de plantado, um
 * atalho que reinsere conteúdo de exemplo no acervo real da pessoa vira
 * armadilha.
 */
export function PlantButton({
  variant = "default",
  className,
}: {
  variant?: "default" | "outline" | "plasma" | "secondary";
  className?: string;
}) {
  const [pending, setPending] = React.useState(false);
  const router = useRouter();

  function plant() {
    setPending(true);
    plantGarden().then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error("Não consegui plantar", { description: res.error });
        return;
      }
      toast.success(`${res.data?.planted ?? 0} itens plantados`, {
        description: "Sementes, brotos e raízes: o ciclo inteiro em funcionamento.",
      });
      router.refresh();
    });
  }

  return (
    <Button variant={variant} onClick={plant} disabled={pending} className={className}>
      {pending ? <Loader2 className="animate-spin" /> : <Sprout />}
      {pending ? "Plantando" : "Plantar acervo de exemplo"}
    </Button>
  );
}

function formatDay(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
