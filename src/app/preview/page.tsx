import { ArrowRight } from "lucide-react";
import { BottomNav, SidebarNav } from "@/components/app-nav";
import { ItemCard } from "@/components/item-card";
import { Constellation } from "@/components/constellation";
import { Garden } from "@/components/garden";
import { Empty, PageHeader, SectionHeader, StageBadge } from "@/components/chrome";
import { ActivityStrip, PulseRing, StageBar } from "@/components/pulse";
import { Button } from "@/components/ui/button";
import { EMPTY_PULSE, STAGES, type Area, type BrainMap, type Stage } from "@/lib/types";

export const dynamic = "force-static";

/**
 * Bancada de QA visual.
 *
 * Todo o resto do app vive atrás de autenticação, o que torna impossível
 * inspecionar o desenho sem uma sessão real e sem dados reais. Esta rota é
 * pública (o middleware já a libera) e monta as MESMAS peças do app com dados
 * de fixture, para conferir contraste, escala tipográfica, estados e
 * comportamento responsivo numa tela só.
 *
 * Não é uma tela de produto: não aparece na navegação e não lê o banco.
 */

const AREAS: Area[] = [
  { id: "a1", name: "IA", slug: "ia", color: "#7c3aed", icon: "sparkles", sort_order: 1 },
  { id: "a2", name: "Agentic", slug: "agentic", color: "#0ea5e9", icon: "bot", sort_order: 2 },
  { id: "a3", name: "Coding", slug: "coding", color: "#22c55e", icon: "code", sort_order: 3 },
  { id: "a4", name: "DevOps", slug: "devops", color: "#f59e0b", icon: "server", sort_order: 4 },
];

const PULSE = {
  ...EMPTY_PULSE,
  total: 20,
  seeds: 4,
  sprouts: 6,
  grown: 7,
  rooted: 3,
  due: 5,
  vitality: 62,
  links: 9,
  streak: 6,
};

const ITEMS = [
  {
    id: "i1",
    kind: "repo" as const,
    title: "LangGraph, agentes como grafo de estados",
    summary:
      "Framework para modelar agentes como máquina de estados: nós são passos, arestas são decisões, e o estado atravessa o grafo inteiro.",
    why_useful:
      "Serve quando seu agente precisa de ciclos, retomada e controle explícito do fluxo.",
    url: "https://github.com/langchain-ai/langgraph",
    source_meta: { stars: 18204, language: "Python" },
    area_id: "a2",
    stage: "rooted" as Stage,
    strength: 88,
    interval_days: 21,
    last_reviewed_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    next_review_at: new Date(Date.now() + 15 * 86400000).toISOString(),
  },
  {
    id: "i2",
    kind: "note" as const,
    title: "pgvector: HNSW não aceita mais de 2000 dimensões",
    summary:
      "Embeddings de 3072 simplesmente não indexam, e a busca vira scan sequencial da tabela inteira sem avisar ninguém.",
    why_useful: "Serve quando a busca semântica fica lenta conforme a base cresce.",
    url: null,
    area_id: "a1",
    stage: "grown" as Stage,
    strength: 58,
    interval_days: 10,
    last_reviewed_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    next_review_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: "i3",
    kind: "idea" as const,
    title: "rate limit: token bucket no edge ou no banco?",
    summary: null,
    why_useful: null,
    url: null,
    area_id: null,
    stage: "seed" as Stage,
    strength: 5,
    interval_days: 0,
    last_reviewed_at: null,
    next_review_at: null,
  },
];

const MAP: BrainMap = {
  nodes: Array.from({ length: 34 }, (_, i) => ({
    id: `n${i}`,
    title: `Item ${i + 1}`,
    kind: "note" as const,
    stage: (["seed", "sprout", "grown", "rooted"] as Stage[])[(i + Math.floor(i / 4)) % 4],
    area_id: AREAS[i % AREAS.length].id,
    vitality: 20 + ((i * 17) % 80),
  })),
  edges: Array.from({ length: 22 }, (_, i) => ({
    a: `n${i}`,
    b: `n${(i * 7 + 3) % 34}`,
    origin: "semantic",
    score: 0.65 + (i % 5) * 0.06,
  })),
};

const ACTIVITY = Array.from({ length: 28 }, (_, i) => {
  const day = new Date(Date.now() - (27 - i) * 86400000).toISOString().slice(0, 10);
  return { day, captures: (i * 3) % 5, reviews: (i * 2) % 4 };
});

const NAV_STATE = { seeds: 4, due: 5, vitality: 62, streak: 6 };

export default function PreviewPage() {
  return (
    <div className="flex min-h-dvh">
      {/* A barra montada como ela aparece em Revisar, para conferir o
          indicador ativo, o fio do ciclo e o rodapé de força. */}
      <SidebarNav state={NAV_STATE} route="/revisar" />
      <BottomNav state={NAV_STATE} route="/revisar" />

      <main className="pb-dock mx-auto w-full max-w-5xl space-y-14 px-4 py-12 sm:px-6 md:px-10">
      <PageHeader
        title="Bancada de QA visual"
        description="As mesmas peças do app, com dados de fixture. Serve para conferir contraste, escala e comportamento responsivo sem precisar de sessão."
        action={
          <Button>
            Ação primária
            <ArrowRight />
          </Button>
        }
      />

      <section>
        <SectionHeader label="Pulso" count="62 de força" />
        <div className="panel p-5 sm:p-7">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="display text-balance">
                o cérebro está <span className="text-acid">firme</span>
              </h2>
              <p className="mt-4 max-w-[52ch] text-pretty text-sm leading-relaxed text-muted-foreground">
                Memória decai. Cada revisão empurra o item mais para longe no tempo e aumenta a
                força dele no seu repertório.
              </p>
              <Button className="mt-6">
                Revisar agora
                <ArrowRight />
              </Button>
            </div>
            <PulseRing value={62} label="Firme" caption="força média do que você guardou" />
          </div>

          <div className="mt-9 border-t border-[hsl(0_0%_100%/0.07)] pt-7">
            <StageBar pulse={PULSE} />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader label="Estágios" />
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STAGES) as Stage[]).map((s) => (
            <StageBadge key={s} stage={s} />
          ))}
        </div>
      </section>

      <section className="enter-up">
        <SectionHeader label="Cartões" count="03" />
        <div className="stagger space-y-3">
          {ITEMS.map((item, i) => (
            <ItemCard
              key={item.id}
              index={i}
              item={item}
              area={AREAS.find((a) => a.id === item.area_id)}
            />
          ))}
        </div>
      </section>

      <section className="enter-soft">
        <SectionHeader label="Ritmo" count="28 dias" />
        <div className="panel-flat p-5 md:p-6">
          <ActivityStrip days={ACTIVITY} />
        </div>
      </section>

      <section>
        <SectionHeader label="Jardim" count="34 plantas" />
        <div className="panel overflow-hidden">
          <Garden nodes={MAP.nodes} edges={MAP.edges} areas={AREAS} />
        </div>
      </section>

      <section className="enter-rise">
        <SectionHeader label="Mapa" count="34 nós" />
        <div className="panel overflow-hidden">
          <Constellation map={MAP} areas={AREAS} height={360} />
        </div>
      </section>

      <section className="enter-up">
        <SectionHeader label="Vazio" />
        <Empty
          title="Nada plantado ainda"
          action={<Button variant="outline">Plantar acervo de exemplo</Button>}
        >
          O ciclo só fica visível com acervo dentro.
        </Empty>
      </section>

      <section>
        <SectionHeader label="Botões" />
        <div className="flex flex-wrap gap-2">
          <Button>Primário</Button>
          <Button variant="plasma">Plasma</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="destructive">Destrutivo</Button>
          <Button disabled>Desativado</Button>
        </div>
      </section>
      </main>
    </div>
  );
}
