"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addTopic, deleteTrack, toggleTopic } from "@/lib/actions/tracks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SectionHeader } from "@/components/chrome";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { Track, TrackTopic } from "@/lib/types";

export function TrackDetail({ track, topics }: { track: Track; topics: TrackTopic[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newTopic, setNewTopic] = useState("");

  // Estado local para o check responder na hora; o servidor confirma depois.
  const [localDone, setLocalDone] = useState<Record<string, boolean>>(
    Object.fromEntries(topics.map((t) => [t.id, t.done])),
  );

  const doneCount = topics.filter((t) => localDone[t.id]).length;
  const pct = topics.length ? Math.round((doneCount / topics.length) * 100) : 0;

  function toggle(topic: TrackTopic) {
    const next = !localDone[topic.id];
    setLocalDone((prev) => ({ ...prev, [topic.id]: next }));

    startTransition(async () => {
      const res = await toggleTopic(topic.id, next);
      if (!res.ok) {
        setLocalDone((prev) => ({ ...prev, [topic.id]: !next }));
        toast.error("Não consegui marcar", { description: res.error });
      } else {
        router.refresh();
      }
    });
  }

  function add() {
    const title = newTopic.trim();
    if (!title) return;

    startTransition(async () => {
      const res = await addTopic(track.id, title);
      if (res.ok) {
        setNewTopic("");
        router.refresh();
      } else {
        toast.error("Não consegui adicionar", { description: res.error });
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteTrack(track.id);
      if (res.ok) {
        toast.success("Trilha apagada");
        router.push("/trilhas");
      } else {
        toast.error("Não consegui apagar", { description: res.error });
      }
    });
  }

  return (
    <div className="space-y-10">
      <header>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-1.5 w-1.5 animate-blink rounded-full bg-acid" />
          <span className="label">
            03<span className="mx-1.5 text-muted-foreground/40">/</span>
            <span className="text-foreground/70">Trilha</span>
          </span>
        </div>

        <h1 className="display-sm mt-4 text-balance">{track.title}</h1>

        {track.description && (
          <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {track.description}
          </p>
        )}

        {/* Painel de progresso: o número manda, a barra confirma. */}
        <div className="panel mt-8 flex items-center gap-6 p-5">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <span className="label">Progresso</span>
              <span className="font-mono text-[10px] tabular-nums tracking-[0.1em] text-muted-foreground">
                {doneCount} de {topics.length}
              </span>
            </div>
            <Progress value={pct} />
          </div>

          <span
            className={cn("numeral shrink-0 text-5xl", pct === 100 ? "text-acid" : "text-foreground")}
            data-numeric
          >
            {pct}
            <span className="ml-1 font-mono text-[11px] tracking-[0.1em] text-muted-foreground">
              %
            </span>
          </span>
        </div>
      </header>

      {/* ── Tópicos como percurso vertical ──────────────────────────── */}
      <section>
        <SectionHeader label="Tópicos" count={String(topics.length).padStart(2, "0")} />

        <ol className="space-y-2">
          {topics.map((topic, i) => {
            const checked = localDone[topic.id] ?? false;
            const last = i === topics.length - 1;

            return (
              <li key={topic.id} className="relative flex gap-4">
                {/* Coluna do percurso: índice e o fio que liga um passo ao outro. */}
                <div className="relative flex w-7 shrink-0 flex-col items-center pt-5">
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums transition-colors",
                      checked ? "text-acid" : "text-muted-foreground/50",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {!last && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-10 h-[calc(100%-1.5rem)] w-px transition-colors duration-500",
                        checked ? "bg-[hsl(var(--acid)/0.4)]" : "bg-[hsl(0_0%_100%/0.08)]",
                      )}
                    />
                  )}
                </div>

                <div
                  className={cn(
                    "mb-2 flex-1 rounded-lg p-4 transition-all duration-300",
                    checked
                      ? "bg-[hsl(var(--surface)/0.5)] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.04)]"
                      : "bg-surface shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)]",
                  )}
                >
                  <div className="flex items-start gap-3.5">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(topic)}
                      className="mt-0.5"
                      aria-label={`Marcar ${topic.title}`}
                    />

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-pretty font-medium leading-snug transition-colors",
                          checked && "text-muted-foreground line-through decoration-acid/40",
                        )}
                      >
                        {topic.title}
                      </p>

                      {topic.notes && (
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {topic.notes}
                        </p>
                      )}

                      {topic.item_id && (
                        <Link
                          href={`/item/${topic.item_id}`}
                          className="group mt-3 inline-flex items-center gap-1.5 datum text-acid"
                        >
                          Abrir anotação
                          <ArrowUpRight className="h-3 w-3 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex gap-2 pl-11">
          <Input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Adicionar tópico..."
            aria-label="Novo tópico"
          />
          <Button onClick={add} disabled={pending || !newTopic.trim()} variant="outline" size="icon">
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            <span className="sr-only">Adicionar tópico</span>
          </Button>
        </div>
      </section>

      <div>
        <div className="rule mb-5" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="hover:text-destructive" disabled={pending}>
              <Trash2 />
              Apagar trilha
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <span className="label text-destructive">Ação irreversível</span>
              <AlertDialogTitle>Apagar esta trilha?</AlertDialogTitle>
              <AlertDialogDescription>
                Os {topics.length} tópicos vão junto. Os itens que eles referenciam continuam
                guardados no seu acervo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Apagar trilha</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
