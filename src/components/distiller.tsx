"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { distill, deleteItem } from "@/lib/actions/items";
import { KindIcon } from "@/components/kind-icon";
import { Empty, SectionHeader } from "@/components/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, timeAgo } from "@/lib/utils";
import { ITEM_KINDS, type Area, type ItemKind } from "@/lib/types";

type Seed = {
  id: string;
  kind: ItemKind;
  title: string;
  content: string;
  url: string | null;
  created_at: string;
};

type Suggestion = {
  id: string;
  title: string;
  area_id: string | null;
  area_slug: string;
  kind: ItemKind;
  summary: string;
  why_useful: string;
  tags: string[];
};

/**
 * Destilador.
 *
 * O ponto do ciclo onde material cru vira conhecimento utilizável. A IA
 * propõe título, área, tipo, resumo e "serve para" do LOTE INTEIRO numa
 * chamada só — uma por item queimaria a quota do dia em cinco sementes.
 *
 * Nada é gravado sem você confirmar. O que muda em relação à v1 é o custo de
 * confirmar: arrastar o cartão para a direita aceita, para a esquerda
 * descarta, e o teclado faz o mesmo sem tirar a mão do lugar. Triagem boa é
 * triagem que termina.
 */
export function Distiller({ seeds, areas }: { seeds: Seed[]; areas: Area[] }) {
  const [suggestions, setSuggestions] = React.useState<Record<string, Suggestion>>({});
  const [organizing, setOrganizing] = React.useState(false);
  const [leaving, setLeaving] = React.useState<Record<string, "apply" | "discard">>({});
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  const suggested = Object.values(suggestions);
  const hasSuggestions = suggested.length > 0;

  // Itens que já saíram na tela somem da lista local na hora, mesmo antes do
  // servidor responder: esperar o round-trip para tirar o cartão faz a
  // triagem parecer travada a cada decisão.
  const visible = seeds.filter((s) => !leaving[s.id]);

  async function runDistill() {
    setOrganizing(true);
    try {
      const res = await fetch("/api/ai/distill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(
          json.quota
            ? "Quota do Gemini esgotada"
            : json.retry
              ? "Gemini sobrecarregado"
              : "A IA não respondeu",
          {
            description: json.error,
            ...(json.retry ? { action: { label: "Tentar de novo", onClick: runDistill } } : {}),
          },
        );
        return;
      }

      const next: Record<string, Suggestion> = {};
      for (const s of json.suggestions ?? []) next[s.id] = s;
      setSuggestions(next);

      const n = Object.keys(next).length;
      toast.success(n ? `${n} ${n === 1 ? "semente destilada" : "sementes destiladas"}` : "Nada a destilar", {
        description: n ? "Revise e confirme, ou arraste para decidir." : undefined,
      });
    } catch {
      toast.error("Falha de rede ao chamar a IA.");
    } finally {
      setOrganizing(false);
    }
  }

  function toDecision(s: Suggestion) {
    return {
      id: s.id,
      title: s.title,
      area_id: s.area_id,
      kind: s.kind,
      summary: s.summary,
      why_useful: s.why_useful,
      tags: s.tags,
    };
  }

  function dropSuggestion(id: string) {
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function applyAll() {
    if (!hasSuggestions) return;
    const ids = suggested.map((s) => s.id);
    setLeaving((l) => ({ ...l, ...Object.fromEntries(ids.map((id) => [id, "apply" as const])) }));

    startTransition(async () => {
      const res = await distill(suggested.map(toDecision));
      if (res.ok) {
        toast.success(`${res.data?.applied ?? 0} brotos no ciclo`, {
          description: "Primeira revisão agendada para daqui a três dias.",
        });
        setSuggestions({});
        router.refresh();
      } else {
        setLeaving({});
        toast.error("Não consegui aplicar", { description: res.error });
      }
    });
  }

  function applyOne(s: Suggestion) {
    setLeaving((l) => ({ ...l, [s.id]: "apply" }));

    startTransition(async () => {
      const res = await distill([toDecision(s)]);
      if (res.ok) {
        dropSuggestion(s.id);
        router.refresh();
      } else {
        setLeaving((l) => {
          const next = { ...l };
          delete next[s.id];
          return next;
        });
        toast.error("Não consegui aplicar", { description: res.error });
      }
    });
  }

  function discard(id: string) {
    setLeaving((l) => ({ ...l, [id]: "discard" }));

    startTransition(async () => {
      const res = await deleteItem(id);
      if (res.ok) {
        dropSuggestion(id);
        router.refresh();
      } else {
        setLeaving((l) => {
          const next = { ...l };
          delete next[id];
          return next;
        });
        toast.error("Não consegui descartar", { description: res.error });
      }
    });
  }

  function patch(id: string, fields: Partial<Suggestion>) {
    setSuggestions((prev) => ({ ...prev, [id]: { ...prev[id], ...fields } }));
  }

  if (seeds.length === 0) {
    return (
      <Empty icon={Sparkles} title="Nenhuma semente esperando">
        Tudo que você capturou já foi destilado e está no ciclo de revisão. Capture algo novo aí em
        cima, ou de qualquer tela, com ⌘K.
      </Empty>
    );
  }

  return (
    <div>
      <SectionHeader
        label={hasSuggestions ? "Confirme ou ajuste" : "Sementes"}
        count={String(visible.length).padStart(2, "0")}
        action={
          <div className="flex shrink-0 flex-wrap gap-2">
            {hasSuggestions && (
              <Button size="sm" onClick={applyAll} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                Aceitar {suggested.length}
              </Button>
            )}
            <Button
              size="sm"
              variant={hasSuggestions ? "outline" : "plasma"}
              onClick={runDistill}
              disabled={organizing}
            >
              {organizing ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {organizing ? "Destilando" : "Destilar com IA"}
            </Button>
          </div>
        }
      />

      {/* A dica do gesto só aparece quando há o que arrastar. */}
      {hasSuggestions && (
        <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 datum/70">
          <span className="flex items-center gap-1.5 text-acid">→ arraste para aceitar</span>
          <span className="flex items-center gap-1.5 text-destructive">← arraste para descartar</span>
        </p>
      )}

      <div className="space-y-3">
        {seeds.map((seed, i) => {
          const s = suggestions[seed.id];
          const exit = leaving[seed.id];

          return (
            <SeedCard
              key={seed.id}
              seed={seed}
              suggestion={s}
              areas={areas}
              index={i}
              scanning={organizing && !s}
              exit={exit}
              disabled={pending}
              onPatch={(fields) => patch(seed.id, fields)}
              onApply={() => s && applyOne(s)}
              onDiscard={() => discard(seed.id)}
              onDismiss={() => dropSuggestion(seed.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Cartão de semente, arrastável.
 *
 * O arrasto é escrito direto no nó dentro do rAF — `setState` por pixel de
 * movimento derrubaria o quadro com meia dúzia de cartões na tela. O React só
 * volta a saber do assunto quando a decisão é tomada.
 *
 * `touch-action: pan-y` é o que permite arrastar na horizontal sem sequestrar
 * a rolagem vertical da página: sem isso, o dedo prende a tela.
 */
function SeedCard({
  seed,
  suggestion,
  areas,
  index,
  scanning,
  exit,
  disabled,
  onPatch,
  onApply,
  onDiscard,
  onDismiss,
}: {
  seed: Seed;
  suggestion?: Suggestion;
  areas: Area[];
  index: number;
  scanning: boolean;
  exit?: "apply" | "discard";
  disabled: boolean;
  onPatch: (fields: Partial<Suggestion>) => void;
  onApply: () => void;
  onDiscard: () => void;
  onDismiss: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef({ active: false, startX: 0, dx: 0, id: -1 });
  const [hint, setHint] = React.useState<"apply" | "discard" | null>(null);

  const draggable = Boolean(suggestion) && !exit && !disabled;

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggable) return;
    // Campos de formulário dentro do cartão precisam do ponteiro para si.
    if ((event.target as HTMLElement).closest("input, textarea, button, [role='combobox']")) return;

    drag.current = { active: true, startX: event.clientX, dx: 0, id: event.pointerId };
    ref.current?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active || !ref.current) return;

    const dx = event.clientX - drag.current.startX;
    drag.current.dx = dx;

    ref.current.style.transition = "none";
    ref.current.style.transform = `translate3d(${dx}px, 0, 0) rotate(${dx * 0.02}deg)`;

    const next = dx > 90 ? "apply" : dx < -90 ? "discard" : null;
    setHint((h) => (h === next ? h : next));
  }

  function onPointerUp() {
    if (!drag.current.active || !ref.current) return;

    const dx = drag.current.dx;
    drag.current.active = false;

    ref.current.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
    ref.current.style.transform = "translate3d(0, 0, 0)";
    setHint(null);

    if (dx > 110) onApply();
    else if (dx < -110) onDiscard();
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ "--i": index, touchAction: "pan-y" } as React.CSSProperties}
      className={cn(
        "relative overflow-hidden rounded-lg bg-surface p-4 transition-shadow duration-500 sm:p-5",
        suggestion
          ? "shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.32),0_24px_48px_-32px_hsl(var(--acid)/0.35)]"
          : "shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)]",
        draggable && "cursor-grab active:cursor-grabbing",
        scanning && "scanning",
        exit === "apply" && "animate-fly-up",
        exit === "discard" && "animate-fly-left",
        hint === "apply" && "shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.8)]",
        hint === "discard" && "shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.8)]",
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)] transition-colors duration-500",
              suggestion
                ? "bg-[hsl(var(--acid)/0.12)] text-acid"
                : "bg-[hsl(0_0%_100%/0.035)] text-muted-foreground",
            )}
          >
            <KindIcon kind={suggestion?.kind ?? seed.kind} className="h-4 w-4" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {suggestion ? (
              <span className="label flex items-center gap-1.5 text-acid">
                <Sparkles className="h-2.5 w-2.5" />
                Destilado
              </span>
            ) : (
              <span className="label text-ember">Semente crua</span>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span className="datum">
              {timeAgo(seed.created_at)}
            </span>
          </div>

          {suggestion ? (
            <Input
              value={suggestion.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              className="h-10 font-medium"
              aria-label="Título sugerido"
            />
          ) : (
            <p className="text-pretty font-medium leading-snug">{seed.title || "Sem título"}</p>
          )}

          {seed.url && (
            <p className="mt-2 truncate font-mono text-[10px] tracking-wide text-muted-foreground">
              {seed.url}
            </p>
          )}
          {!seed.url && seed.content && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {seed.content}
            </p>
          )}

          {suggestion && (
            <div className="mt-4 space-y-4">
              <p className="animate-fade-in text-sm leading-relaxed text-muted-foreground">
                {suggestion.summary}
              </p>

              <p className="animate-fade-in border-l border-[hsl(var(--acid)/0.35)] pl-3 text-sm leading-relaxed text-foreground/80">
                <span className="label mr-1.5 text-acid">Serve para</span>
                {suggestion.why_useful}
              </p>

              <div className="flex flex-wrap gap-2">
                <Select
                  value={suggestion.area_id ?? "none"}
                  onValueChange={(v) => onPatch({ area_id: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-8 w-full sm:w-40" aria-label="Área">
                    <SelectValue placeholder="Área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem área</SelectItem>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={suggestion.kind}
                  onValueChange={(v) => onPatch({ kind: v as ItemKind })}
                >
                  <SelectTrigger className="h-8 w-full sm:w-36" aria-label="Tipo">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {suggestion.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestion.tags.map((t) => (
                    <Badge key={t} variant="muted">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          {suggestion && (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-acid hover:text-acid"
                onClick={onApply}
                disabled={disabled}
                title="Aceitar (vira broto)"
              >
                <Check />
                <span className="sr-only">Aceitar</span>
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onDismiss}
                title="Ignorar sugestão"
              >
                <X />
                <span className="sr-only">Ignorar sugestão</span>
              </Button>
            </>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="hover:text-destructive"
            onClick={onDiscard}
            disabled={disabled}
            title="Descartar semente"
          >
            <Trash2 />
            <span className="sr-only">Descartar</span>
          </Button>
        </div>
      </div>

      {/* Pistas do gesto: aparecem nas bordas conforme o cartão é puxado. */}
      {hint && (
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 flex w-20 items-center justify-center datum",
            hint === "apply" ? "right-0 text-acid" : "left-0 text-destructive",
          )}
        >
          {hint === "apply" ? "aceitar" : "descartar"}
        </span>
      )}
    </div>
  );
}
