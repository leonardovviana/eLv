import Link from "next/link";
import { Network, Sprout } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBrainMap, getPulse } from "@/lib/brain";
import { Constellation } from "@/components/constellation";
import { LinkSuggestions } from "@/components/link-suggestions";
import { Empty, PageHeader, SectionHeader } from "@/components/chrome";
import { PlantButton } from "@/components/pulse";
import { Button } from "@/components/ui/button";
import type { Area, LinkSuggestion } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Mapa — o que existe entre os itens.
 *
 * Um acervo é uma lista; um cérebro é uma rede. Esta tela é a única que mostra
 * o acervo como rede, e é ela que responde "o que eu sei sobre isso que ainda
 * não liguei?".
 *
 * `item_links` existia desde a primeira migration e nunca tinha sido escrita.
 * Aqui ela finalmente serve para alguma coisa.
 */
export default async function MapPage() {
  const supabase = await createClient();

  const [map, pulse, { data: areas }, { data: suggestions }] = await Promise.all([
    getBrainMap(supabase, 140),
    getPulse(supabase),
    supabase.from("areas").select("id, name, slug, color, icon, sort_order").order("sort_order"),
    supabase.rpc("suggest_links", { p_limit: 6 }),
  ]);

  const areaList = (areas ?? []) as Area[];

  const countByArea = new Map<string, number>();
  for (const n of map.nodes) {
    if (n.area_id) countByArea.set(n.area_id, (countByArea.get(n.area_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title={
          <>
            O que está <span className="text-plasma">entre</span> as coisas
          </>
        }
        description="Cada ponto é um item: o tamanho é a força, a cor é a área, o anel vazado é semente crua. As linhas são conexões: quanto mais delas, menos o acervo é uma pilha."
      />

      {map.nodes.length === 0 ? (
        <Empty
          icon={Sprout}
          title="Nada no mapa"
          action={
            <>
              <PlantButton />
              <Button asChild variant="outline">
                <Link href="/fluxo">Capturar</Link>
              </Button>
            </>
          }
        >
          Sem itens não há rede. Plante o acervo de exemplo, que já vem com algumas ligações
          feitas, ou capture o seu primeiro item.
        </Empty>
      ) : (
        <>
          <section className="enter-soft">
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 shadow-[inset_0_-1px_0_0_hsl(0_0%_100%/0.06)]">
                <span className="label flex items-center gap-2">
                  <span className="beat" style={{ "--tone": "var(--plasma)" } as React.CSSProperties} />
                  {map.nodes.length} nós · {map.edges.length}{" "}
                  {map.edges.length === 1 ? "ligação" : "ligações"}
                </span>

                <span className="label text-muted-foreground/60">clique num ponto para abrir</span>
              </div>

              {/* Alturas diferentes por tamanho de tela: num celular, 460px de
                  canvas empurrariam todo o resto para fora da primeira dobra. */}
              <div className="sm:hidden">
                <Constellation map={map} areas={areaList} height={320} />
              </div>
              <div className="hidden sm:block lg:hidden">
                <Constellation map={map} areas={areaList} height={420} />
              </div>
              <div className="hidden lg:block">
                <Constellation map={map} areas={areaList} height={520} />
              </div>
            </div>
          </section>

          {/* Legenda: o mapa só é legível com a chave de cores por perto. */}
          <section className="enter-rise">
            <SectionHeader label="Áreas" count={String(areaList.length).padStart(2, "0")} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {areaList.map((area, i) => (
                <Link
                  key={area.id}
                  href={`/areas/${area.slug}`}
                  style={{ "--i": i, "--glow": area.color } as React.CSSProperties}
                  className="spotlight lift flex items-center gap-3 rounded-lg bg-surface px-4 py-3 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: area.color, boxShadow: `0 0 10px ${area.color}` }}
                  />
                  <span className="truncate text-sm">{area.name}</span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                    {countByArea.get(area.id) ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Sugestões de ligação */}
          <section className="enter-up">
            <SectionHeader
              label="Ligações sugeridas"
              count={`${pulse.links} feitas`}
              action={
                pulse.unindexed > 0 ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/config">Indexar {pulse.unindexed}</Link>
                  </Button>
                ) : undefined
              }
            />

            {pulse.unindexed > 0 && (suggestions ?? []).length === 0 ? (
              <Empty icon={Network} title="Falta indexar">
                As sugestões saem da proximidade entre os embeddings. Com {pulse.unindexed}{" "}
                {pulse.unindexed === 1 ? "item fora do índice" : "itens fora do índice"}, não há o que
                comparar ainda.
              </Empty>
            ) : (
              <LinkSuggestions suggestions={(suggestions ?? []) as LinkSuggestion[]} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
