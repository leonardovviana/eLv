"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock, ExternalLink, Eye, Loader2, MoonStar } from "lucide-react";
import { toast } from "sonner";
import { review, snooze } from "@/lib/actions/cycle";
import { KindIcon } from "@/components/kind-icon";
import { StageBadge, Vitality } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/motion";
import { cn, safeHost } from "@/lib/utils";
import { GRADES, STAGES, type Area, type DueItem, type Grade } from "@/lib/types";

/**
 * Sessão de revisão.
 *
 * A peça que faltava no app inteiro: o motivo para voltar amanhã. Um segundo
 * cérebro que só guarda é um arquivo morto — o valor aparece quando o que
 * está dentro volta à tona antes de você esquecer.
 *
 * O formato é deliberadamente duro: o resumo fica ESCONDIDO até você tentar
 * lembrar. Ler o resumo primeiro e concluir "sim, eu sabia" é a ilusão de
 * competência que faz revisão passiva não funcionar. O esforço de recuperar é
 * o que fixa.
 *
 * A fila é congelada no início: itens re-agendados para hoje mesmo (nota
 * "esqueci" manda para amanhã, mas o relógio pode virar) não voltam no meio
 * da própria sessão, o que seria um laço sem fim.
 */
export function ReviewSession({ queue, areas }: { queue: DueItem[]; areas: Area[] }) {
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [exit, setExit] = React.useState<"up" | "left" | null>(null);
  const [log, setLog] = React.useState<{ grade: Grade; gain: number }[]>([]);
  const router = useRouter();

  const areaById = React.useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const current = queue[index];
  const done = index >= queue.length;

  const grade = React.useCallback(
    (value: Grade) => {
      if (!current || pending) return;
      setPending(true);

      review(current.id, value).then((res) => {
        if (!res.ok) {
          setPending(false);
          toast.error("Não consegui registrar", { description: res.error });
          return;
        }

        const gain = (res.data?.strength ?? 0) - current.vitality;
        setLog((l) => [...l, { grade: value, gain }]);
        setExit("up");

        // A troca de cartão espera a animação de saída terminar. Trocar antes
        // faria o conteúdo novo aparecer dentro do cartão que ainda está indo
        // embora — o efeito de "vira a página" viraria um piscar.
        setTimeout(() => {
          setExit(null);
          setRevealed(false);
          setPending(false);
          setIndex((i) => i + 1);
        }, 300);
      });
    },
    [current, pending],
  );

  const postpone = React.useCallback(() => {
    if (!current || pending) return;
    setPending(true);

    snooze(current.id, 1).then((res) => {
      if (!res.ok) {
        setPending(false);
        toast.error("Não consegui adiar", { description: res.error });
        return;
      }
      setExit("left");
      setTimeout(() => {
        setExit(null);
        setRevealed(false);
        setPending(false);
        setIndex((i) => i + 1);
      }, 300);
    });
  }, [current, pending]);

  // Teclado: espaço revela, 1–4 dão nota, S adia. Revisar com a mão no mouse
  // é lento, e lentidão é o que faz a sessão ser abandonada na metade.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (done || pending) return;
      const el = event.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

      if (event.code === "Space" || event.key === "Enter") {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        else grade("good");
        return;
      }

      if (!revealed) return;

      const found = GRADES.find((g) => g.key === event.key);
      if (found) {
        event.preventDefault();
        grade(found.value);
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        postpone();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, done, pending, grade, postpone]);

  if (done) {
    return <SessionSummary log={log} total={queue.length} onLeave={() => router.refresh()} />;
  }

  const area = current.area_id ? areaById.get(current.area_id) : undefined;
  const stageMeta = STAGES[current.stage] ?? STAGES.sprout;
  const progress = (index / queue.length) * 100;

  return (
    <div className="space-y-6">
      {/* Progresso da sessão */}
      <div>
        <div className="mb-2.5 flex items-center justify-between datum">
          <span>
            <span className="text-foreground">{index + 1}</span>
            <span className="mx-1 text-muted-foreground/40">/</span>
            {queue.length}
          </span>
          <span className="flex items-center gap-1.5 text-ember">
            <Clock className="h-3 w-3" />
            {current.days_overdue < 1
              ? "vence hoje"
              : `vencido há ${Math.round(current.days_overdue)} ${Math.round(current.days_overdue) === 1 ? "dia" : "dias"}`}
          </span>
        </div>

        <span className="meter">
          <span style={{ width: `${Math.max(2, progress)}%` }} />
        </span>
      </div>

      {/* Cartão */}
      <div
        key={current.id}
        className={cn(
          "panel overflow-hidden",
          exit === "up" && "animate-fly-up",
          exit === "left" && "animate-fly-left",
          !exit && "animate-scale-in",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 shadow-[inset_0_-1px_0_0_hsl(0_0%_100%/0.06)] sm:px-7">
          <StageBadge stage={current.stage} />

          {area && (
            <span className="datum" style={{ color: area.color }}>
              {area.name}
            </span>
          )}

          <span className="ml-auto flex items-center gap-2">
            <span className="w-16">
              <Vitality value={current.vitality} base={current.strength} tone={stageMeta.tone} />
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {current.vitality}
            </span>
          </span>
        </div>

        <div className="px-5 py-8 sm:px-7 sm:py-10">
          <div className="flex items-start gap-4">
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[hsl(0_0%_100%/0.035)] text-muted-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)]">
              <KindIcon kind={current.kind} className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <h2 className="text-balance font-display text-2xl leading-tight tracking-tightest sm:text-3xl">
                {current.title}
              </h2>

              {current.url && (
                <p className="mt-2 truncate font-mono text-[10px] tracking-wide text-muted-foreground">
                  {safeHost(current.url)}
                </p>
              )}
            </div>
          </div>

          {/* A pergunta. Enquanto não revelar, o conteúdo fica coberto. */}
          {!revealed ? (
            <div className="mt-10 text-center">
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                Antes de olhar: você lembra{" "}
                <span className="text-foreground">para que isso serve</span>?
              </p>

              <Button size="lg" className="mt-6" onClick={() => setRevealed(true)}>
                <Eye />
                Revelar
              </Button>

              <p className="label mt-5 text-muted-foreground/50">espaço para revelar</p>
            </div>
          ) : (
            <div className="mt-8 space-y-5">
              {current.why_useful && (
                <p className="animate-rise border-l border-[hsl(var(--acid)/0.35)] pl-4 text-pretty leading-relaxed text-foreground/90">
                  <span className="label mr-2 text-acid">Serve para</span>
                  {current.why_useful}
                </p>
              )}

              {current.summary && (
                <p
                  className="animate-rise text-pretty text-sm leading-relaxed text-muted-foreground"
                  style={{ animationDelay: "80ms" }}
                >
                  {current.summary}
                </p>
              )}

              {!current.summary && !current.why_useful && current.content && (
                <p className="animate-rise line-clamp-6 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {current.content}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {current.url && (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 datum text-plasma hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    abrir fonte
                  </a>
                )}
                <Link
                  href={`/item/${current.id}`}
                  className="flex items-center gap-1.5 datum hover:text-foreground"
                >
                  ver item completo
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Notas */}
        {revealed && (
          <div className="grid grid-cols-2 gap-px bg-[hsl(0_0%_100%/0.07)] sm:grid-cols-4">
            {GRADES.map((g) => (
              <button
                key={g.value}
                type="button"
                disabled={pending}
                onClick={() => grade(g.value)}
                className={cn(
                  "group flex flex-col items-center gap-1 bg-[hsl(var(--surface))] px-3 py-4 transition-colors duration-200 disabled:opacity-40",
                  g.value === "forgot" && "hover:bg-[hsl(var(--destructive)/0.12)]",
                  g.value === "hard" && "hover:bg-[hsl(var(--ember)/0.12)]",
                  g.value === "good" && "hover:bg-[hsl(var(--acid)/0.12)]",
                  g.value === "easy" && "hover:bg-[hsl(var(--plasma)/0.12)]",
                )}
              >
                <span className="flex items-center gap-1.5 datum text-foreground">
                  <kbd className="rounded-[3px] bg-[hsl(0_0%_100%/0.06)] px-1 text-[9px] text-muted-foreground">
                    {g.key}
                  </kbd>
                  {g.label}
                </span>
                <span className="text-[10px] text-muted-foreground">{g.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={postpone}
          disabled={pending}
          className="flex items-center gap-1.5 datum transition-colors hover:text-foreground disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <MoonStar className="h-3 w-3" />}
          adiar um dia
          <kbd className="ml-1 rounded-[3px] bg-[hsl(0_0%_100%/0.06)] px-1 py-0.5 text-[9px]">s</kbd>
        </button>

        <span className="datum">
          {log.length} {log.length === 1 ? "revisado" : "revisados"}
        </span>
      </div>
    </div>
  );
}

/**
 * Fim de sessão.
 *
 * Existe para a fila zerada ter uma recompensa visível. Sem isso, terminar de
 * revisar produz uma tela vazia — o mesmo vazio que o app tinha antes, só que
 * depois de trabalho feito.
 */
function SessionSummary({
  log,
  total,
  onLeave,
}: {
  log: { grade: Grade; gain: number }[];
  total: number;
  onLeave: () => void;
}) {
  const gained = log.reduce((sum, l) => sum + Math.max(0, l.gain), 0);
  const solid = log.filter((l) => l.grade === "good" || l.grade === "easy").length;

  return (
    <div className="panel animate-scale-in overflow-hidden p-8 text-center sm:p-12">
      <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-acid/30" />
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--acid)/0.12)] text-acid shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.4)]">
          <Check className="h-6 w-6" />
        </span>
      </div>

      <h2 className="mt-7 font-display text-3xl tracking-tightest">
        {total === 0 ? "Nada vencendo hoje" : "Fila zerada"}
      </h2>

      <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
        {total === 0
          ? "Seu acervo está em dia. Volte amanhã, ou capture algo novo enquanto está aqui."
          : "O que você acabou de revisar volta mais para frente no tempo. Quanto mais fácil foi, mais longe foi jogado."}
      </p>

      {log.length > 0 && (
        <dl className="mx-auto mt-8 grid max-w-sm grid-cols-3 gap-px overflow-hidden rounded-md bg-[hsl(0_0%_100%/0.07)]">
          {[
            { label: "Revisados", value: log.length, tone: "text-foreground" },
            { label: "Firmes", value: solid, tone: "text-acid" },
            { label: "Força ganha", value: gained, tone: "text-plasma" },
          ].map((m) => (
            <div key={m.label} className="bg-[hsl(var(--surface))] p-4">
              <dt className="label">{m.label}</dt>
              <dd className={cn("numeral mt-2 text-3xl", m.tone)}>
                <CountUp value={m.value} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-9 flex flex-wrap justify-center gap-2.5">
        <Button asChild onClick={onLeave}>
          <Link href="/">
            Voltar para Hoje
            <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/fluxo">Capturar algo</Link>
        </Button>
      </div>
    </div>
  );
}
