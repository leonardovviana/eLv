import Link from "next/link";
import { ArrowUpRight, Clock, Star } from "lucide-react";
import { KindIcon } from "@/components/kind-icon";
import { StageGlyph, Vitality } from "@/components/chrome";
import { cn, dueLabel, safeHost, vitalityOf } from "@/lib/utils";
import { ITEM_KINDS, STAGES, type Area, type ItemKind, type SourceMeta, type Stage } from "@/lib/types";

export type ItemCardData = {
  id: string;
  kind: ItemKind;
  title: string;
  summary?: string | null;
  why_useful?: string | null;
  url?: string | null;
  source_meta?: SourceMeta | null;
  area_id?: string | null;
  stage?: Stage;
  strength?: number | null;
  interval_days?: number | null;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
};

/**
 * Cartão de item.
 *
 * A cor da área entra como filete vertical na aresta esquerda, não como fundo
 * colorido: seis áreas com seis fundos transformariam a lista numa colcha. O
 * filete identifica à distância e some do caminho da leitura.
 *
 * O que mudou da v1: o cartão agora carrega ESTADO, não só conteúdo. Força,
 * estágio e vencimento ficam no rodapé, na mesma posição em toda lista, para
 * dar para varrer uma tela inteira e ver o que está esfriando sem abrir nada.
 */
export function ItemCard({
  item,
  area,
  className,
  index,
}: {
  item: ItemCardData;
  area?: Area;
  className?: string;
  /** Alimenta a cascata de entrada. */
  index?: number;
}) {
  const meta = item.source_meta ?? {};
  const kindLabel = ITEM_KINDS.find((k) => k.value === item.kind)?.label ?? "Item";
  const stage = item.stage ?? "sprout";
  const stageMeta = STAGES[stage] ?? STAGES.sprout;
  const vitality = vitalityOf(item);
  const due = dueLabel(item.next_review_at);

  const facts: React.ReactNode[] = [];
  if (typeof meta.stars === "number") {
    facts.push(
      <span key="stars" className="inline-flex items-center gap-1 tabular-nums">
        <Star className="h-2.5 w-2.5" />
        {meta.stars.toLocaleString("pt-BR")}
      </span>,
    );
  }
  if (meta.language) facts.push(<span key="lang">{meta.language}</span>);
  if (item.url) {
    facts.push(
      <span key="host" className="truncate">
        {meta.site ?? safeHost(item.url)}
      </span>,
    );
  }

  return (
    <Link
      href={`/item/${item.id}`}
      style={
        { "--i": index ?? 0, "--glow": stageMeta.tone } as React.CSSProperties
      }
      className={cn(
        "spotlight lift group block overflow-hidden rounded-lg bg-surface p-4 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)] hover:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.28),0_24px_48px_-28px_hsl(0_0%_0%/0.9)] sm:p-5",
        className,
      )}
    >
      <span aria-hidden className="ticks absolute inset-0 rounded-lg" />

      <div className="flex items-start gap-3 sm:gap-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(0_0%_100%/0.035)] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)] transition-all duration-500 ease-spring group-hover:scale-110 group-hover:bg-[hsl(var(--acid)/0.1)] group-hover:text-acid group-hover:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.3)]">
          <KindIcon kind={item.kind} className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* Procedência em uma linha: estágio, tipo, área. Sem pontos
                  médios entre tudo — o espaço separa igual e não vira ruído. */}
              <p className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span
                  className="flex items-center gap-1.5"
                  style={{ color: `hsl(${stageMeta.tone})` }}
                >
                  <StageGlyph stage={stage} className="shrink-0" />
                  {stageMeta.label}
                </span>

                <span>{kindLabel}</span>

                {area && (
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: area.color }}
                    />
                    {area.name}
                  </span>
                )}
              </p>

              <p className="text-pretty font-medium leading-snug text-foreground">
                {item.title || "Sem título"}
              </p>
            </div>

            <ArrowUpRight className="mt-0.5 hidden h-4 w-4 shrink-0 -translate-x-1 translate-y-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:text-acid group-hover:opacity-100 sm:block" />
          </div>

          {item.summary && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {item.summary}
            </p>
          )}

          {item.why_useful && (
            <p className="mt-3 line-clamp-2 border-l border-[hsl(var(--acid)/0.35)] pl-3 text-sm leading-relaxed text-foreground/80">
              <span className="label mr-1.5 text-acid">Serve para</span>
              {item.why_useful}
            </p>
          )}

          {/* Rodapé de estado: força à esquerda, procedência e prazo à direita. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {stage !== "seed" && (
              <span className="flex min-w-[68px] max-w-[120px] flex-1 items-center gap-2">
                <Vitality value={vitality} base={item.strength ?? 0} tone={stageMeta.tone} />
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {vitality}
                </span>
              </span>
            )}

            {facts.length > 0 && (
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 datum text-muted-foreground">
                {facts.map((fact, i) => (
                  <span key={i} className="flex min-w-0 items-center gap-2">
                    {i > 0 && <span className="text-muted-foreground/35">·</span>}
                    {fact}
                  </span>
                ))}
              </span>
            )}

            {due && (
              <span
                className={cn(
                  "ml-auto flex shrink-0 items-center gap-1 datum",
                  due.overdue ? "text-ember" : "text-muted-foreground",
                )}
              >
                <Clock className="h-2.5 w-2.5" />
                {due.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
