"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Brain, Loader2, Search, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ItemCard, type ItemCardData } from "@/components/item-card";
import { Empty, SectionHeader } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ITEM_KINDS, type Area } from "@/lib/types";

type Hit = ItemCardData & { score: number };
type Source = { id: string; title: string; kind: string; url: string | null };

export function SearchClient({
  areas,
  initialQuery = "",
  initialMode = "buscar",
}: {
  areas: Area[];
  initialQuery?: string;
  initialMode?: "buscar" | "perguntar";
}) {
  const areaById = new Map(areas.map((a) => [a.id, a]));

  // A paleta de comando manda para cá com a consulta já na URL. Chegar numa
  // caixa vazia depois de ter digitado a frase seria pedir para digitar duas
  // vezes, então o termo entra preenchido e a busca dispara sozinha.
  const [tab, setTab] = useState<"buscar" | "perguntar">(initialMode);

  // Busca por palavra
  const [q, setQ] = useState(initialMode === "buscar" ? initialQuery : "");
  const [areaId, setAreaId] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [semanticOff, setSemanticOff] = useState<string | null>(null);

  // Perguntar ao cérebro
  const [question, setQuestion] = useState(initialMode === "perguntar" ? initialQuery : "");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{
    answer: string;
    confident: boolean;
    sources: Source[];
  } | null>(null);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const term = q.trim();
    if (!term || searching) return;

    setSearching(true);
    setSemanticOff(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          q: term,
          areaId: areaId === "all" ? null : areaId,
          kind: kind === "all" ? null : kind,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error("Busca falhou", { description: json.error });
        return;
      }

      setHits(json.results ?? []);
      // A busca não quebra sem o Gemini, mas o usuário merece saber que os
      // resultados vieram só por palavra-chave.
      if (!json.semanticUsed && json.semanticError) setSemanticOff(json.semanticError);
    } catch {
      toast.error("Falha de rede na busca.");
    } finally {
      setSearching(false);
    }
  }

  async function runAsk(e?: React.FormEvent) {
    e?.preventDefault();
    const text = question.trim();
    if (!text || asking) return;

    setAsking(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(
          json.quota
            ? "Quota do Gemini esgotada"
            : json.retry
              ? "Gemini sobrecarregado"
              : "Não consegui responder",
          {
            description: json.error,
            ...(json.retry ? { action: { label: "Tentar de novo", onClick: () => runAsk() } } : {}),
          },
        );
        return;
      }
      setAnswer(json);
    } catch {
      toast.error("Falha de rede ao perguntar.");
    } finally {
      setAsking(false);
    }
  }

  // Uma vez e só uma: sem a trava, cada re-render com a mesma URL refaria a
  // consulta, e a versão "perguntar" gastaria quota do Gemini a cada uma.
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || !initialQuery.trim()) return;
    fired.current = true;

    // Agendado, não chamado direto: disparar a consulta dentro do efeito
    // escreveria estado no meio da fase de commit e obrigaria o React a um
    // segundo passe de render antes de pintar a tela.
    const id = setTimeout(() => {
      if (initialMode === "perguntar") runAsk();
      else runSearch();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "buscar" | "perguntar")}>
      <TabsList>
        <TabsTrigger value="buscar">
          <Search />
          Buscar
        </TabsTrigger>
        <TabsTrigger value="perguntar">
          <Brain />
          Perguntar
        </TabsTrigger>
      </TabsList>

      {/* ── Busca híbrida ───────────────────────────────────────────── */}
      <TabsContent value="buscar" className="space-y-5">
        <form onSubmit={runSearch} className="space-y-3">
          {/* Console de consulta: o campo é o elemento dominante da tela. */}
          <div className="panel flex items-center gap-3 p-2 pl-4 transition-shadow duration-300 focus-within:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.4),0_0_0_4px_hsl(var(--acid)/0.08)]">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="O que você está procurando?"
              autoFocus
              aria-label="Termo de busca"
              className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 md:text-sm"
            />
            <Button type="submit" size="sm" disabled={searching || !q.trim()}>
              {searching ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              <span className="hidden sm:inline">Buscar</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="label mr-1 hidden sm:inline">Filtros</span>

            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger className="h-8 w-36" aria-label="Filtrar por área">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-8 w-36" aria-label="Filtrar por tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {ITEM_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>

        {semanticOff && (
          <div className="flex items-start gap-3 rounded-lg bg-[hsl(var(--ember)/0.07)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--ember)/0.25)]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
            <div className="min-w-0">
              <p className="label text-ember">Modo degradado</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                A busca semântica não respondeu. Estes resultados vieram só por palavra-chave.{" "}
                <span className="font-mono text-xs text-muted-foreground/70">({semanticOff})</span>
              </p>
            </div>
          </div>
        )}

        {searching && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="scanning h-28 rounded-lg bg-[hsl(0_0%_100%/0.03)] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]"
              />
            ))}
          </div>
        )}

        {!searching && hits !== null && (
          <div>
            {hits.length === 0 ? (
              <Empty icon={Search} title="Nada encontrado">
                Tente outras palavras, ou confira em Config se os itens já foram indexados.
              </Empty>
            ) : (
              <>
                <SectionHeader
                  label="Resultados"
                  count={String(hits.length).padStart(2, "0")}
                />
                <ol className="stagger space-y-3">
                  {hits.map((hit, i) => (
                    <li key={hit.id} className="flex items-start gap-3">
                      {/* O rank importa: a fusão RRF ordena, e a ordem é o dado. */}
                      <span className="mt-6 hidden w-6 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground/50 sm:block">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <ItemCard
                        className="flex-1"
                        item={hit}
                        area={hit.area_id ? areaById.get(hit.area_id) : undefined}
                      />
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}

        {hits === null && !searching && (
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Full-text do Postgres e vetores fundidos por Reciprocal Rank Fusion. Você não precisa
            acertar a palavra, só chegar perto do sentido.
          </p>
        )}
      </TabsContent>

      {/* ── Perguntar ao cérebro ────────────────────────────────────── */}
      <TabsContent value="perguntar" className="space-y-5">
        <form onSubmit={runAsk}>
          <div className="panel flex items-center gap-3 p-2 pl-4 transition-shadow duration-300 focus-within:shadow-[inset_0_0_0_1px_hsl(var(--plasma)/0.4),0_0_0_4px_hsl(var(--plasma)/0.08)]">
            <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="O que eu já salvei sobre orquestrar agentes?"
              aria-label="Pergunta"
              className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 md:text-sm"
            />
            <Button type="submit" size="sm" variant="plasma" disabled={asking || !question.trim()}>
              {asking ? <Loader2 className="animate-spin" /> : <Sparkles />}
              <span className="hidden sm:inline">Perguntar</span>
            </Button>
          </div>
        </form>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Responde usando só o que está guardado aqui dentro. Quando a base não cobre, ele diz
          que não sabe em vez de inventar.
        </p>

        {asking && (
          <div className="panel p-6">
            <p className="label flex items-center gap-2 text-plasma">
              <Loader2 className="h-3 w-3 animate-spin" />
              Lendo suas anotações
            </p>
            <div className="mt-5 space-y-2.5">
              <div className="scanning h-3 w-full rounded bg-[hsl(0_0%_100%/0.04)]" />
              <div className="scanning h-3 w-[88%] rounded bg-[hsl(0_0%_100%/0.04)]" />
              <div className="scanning h-3 w-[64%] rounded bg-[hsl(0_0%_100%/0.04)]" />
            </div>
          </div>
        )}

        {answer && (
          <article className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-6 py-3 shadow-[inset_0_-1px_0_0_hsl(0_0%_100%/0.06)]">
              <span className="label flex items-center gap-2 text-plasma">
                <Brain className="h-3 w-3" />
                Resposta
              </span>
              <span
                className={`datum ${
                  answer.confident ? "text-acid" : "text-ember"
                }`}
              >
                {answer.confident ? "Base cobre" : "Base rala"}
              </span>
            </div>

            <div className="p-6">
              {!answer.confident && (
                <p className="mb-5 flex items-start gap-3 rounded-md bg-[hsl(var(--ember)/0.07)] p-3.5 text-sm leading-relaxed text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--ember)/0.22)]">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                  Sua base não cobre bem essa pergunta. Leia com ressalva.
                </p>
              )}

              <p className="whitespace-pre-wrap text-pretty leading-relaxed">{answer.answer}</p>

              {answer.sources.length > 0 && (
                <div className="mt-6">
                  <SectionHeader
                    label="Fontes"
                    count={String(answer.sources.length).padStart(2, "0")}
                  />
                  <ol className="space-y-1.5">
                    {answer.sources.map((s, i) => (
                      <li key={s.id}>
                        <Link
                          href={`/item/${s.id}`}
                          className="group flex items-baseline gap-3 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-[hsl(0_0%_100%/0.03)]"
                        >
                          <span className="font-mono text-[10px] tabular-nums text-plasma">
                            [{String(i + 1).padStart(2, "0")}]
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground/85 group-hover:text-foreground">
                            {s.title}
                          </span>
                          <ArrowRight className="h-3 w-3 shrink-0 self-center text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </article>
        )}
      </TabsContent>
    </Tabs>
  );
}
