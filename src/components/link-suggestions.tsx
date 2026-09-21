"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { linkItems } from "@/lib/actions/cycle";
import { KindIcon } from "@/components/kind-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LinkSuggestion } from "@/lib/types";

/**
 * Ligações que o acervo sugere.
 *
 * Vem de proximidade entre os embeddings dos dois itens — nenhuma chamada de
 * IA é feita aqui, o cálculo é do Postgres em cima do que já está indexado.
 * Sugerir conexão gastando quota diária seria o jeito mais rápido de tornar
 * o recurso inutilizável.
 *
 * Recusar é só local: a sugestão volta se ainda fizer sentido na próxima
 * visita. Guardar recusas exigiria uma tabela de "não me mostre mais" para um
 * ganho que nem sabemos se existe.
 */
export function LinkSuggestions({ suggestions }: { suggestions: LinkSuggestion[] }) {
  const [hidden, setHidden] = React.useState<Record<string, true>>({});
  const [pending, setPending] = React.useState<string | null>(null);
  const router = useRouter();

  const visible = suggestions.filter((s) => !hidden[`${s.a_id}-${s.b_id}`]);

  if (visible.length === 0) {
    return (
      <p className="panel-empty px-5 py-8 text-center text-sm text-muted-foreground">
        Nenhuma ligação óbvia sobrando. Conforme o acervo cresce, novas aparecem aqui.
      </p>
    );
  }

  function connect(s: LinkSuggestion) {
    const key = `${s.a_id}-${s.b_id}`;
    setPending(key);

    linkItems(s.a_id, s.b_id, "semantic", s.score).then((res) => {
      setPending(null);
      if (!res.ok) {
        toast.error("Não consegui ligar", { description: res.error });
        return;
      }
      setHidden((h) => ({ ...h, [key]: true }));
      toast.success("Ligado", { description: "A aresta já aparece no mapa." });
      router.refresh();
    });
  }

  return (
    <div className="stagger space-y-2.5">
      {visible.map((s, i) => {
        const key = `${s.a_id}-${s.b_id}`;
        const busy = pending === key;

        return (
          <div
            key={key}
            style={{ "--i": i } as React.CSSProperties}
            className="group rounded-lg bg-surface p-4 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)] transition-shadow duration-300 hover:shadow-[inset_0_0_0_1px_hsl(var(--plasma)/0.3)]"
          >
            <div className="flex items-center gap-2">
              <span className="datum text-plasma">
                {Math.round(s.score * 100)}% de proximidade
              </span>
              <span
                aria-hidden
                className="h-px flex-1 bg-gradient-to-r from-[hsl(var(--plasma)/0.4)] to-transparent"
              />
            </div>

            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
              <Side id={s.a_id} title={s.a_title} kind={s.a_kind} />

              <span
                aria-hidden
                className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--plasma)/0.1)] text-plasma shadow-[inset_0_0_0_1px_hsl(var(--plasma)/0.3)] sm:flex"
              >
                <Link2 className="h-3.5 w-3.5" />
              </span>

              <Side id={s.b_id} title={s.b_title} kind={s.b_kind} />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" variant="plasma" onClick={() => connect(s)} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
                Ligar
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setHidden((h) => ({ ...h, [key]: true }))}
                disabled={busy}
              >
                <X />
                Agora não
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Side({ id, title, kind }: { id: string; title: string; kind: LinkSuggestion["a_kind"] }) {
  return (
    <Link
      href={`/item/${id}`}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5 rounded-md bg-[hsl(0_0%_100%/0.02)] px-3 py-2.5",
        "shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)] transition-colors hover:bg-[hsl(0_0%_100%/0.05)]",
      )}
    >
      <KindIcon kind={kind} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{title}</span>
    </Link>
  );
}
