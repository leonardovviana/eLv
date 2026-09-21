import Link from "next/link";
import { CalendarClock, Sprout } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDueQueue, getPulse } from "@/lib/brain";
import { ReviewSession } from "@/components/review-session";
import { Empty, PageHeader } from "@/components/chrome";
import { PlantButton } from "@/components/pulse";
import { Button } from "@/components/ui/button";
import { ItemCard } from "@/components/item-card";
import { SectionHeader } from "@/components/chrome";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Revisar — o que traz você de volta.
 *
 * A fila é limitada a 12 por sessão de propósito. Revisão espaçada só
 * funciona com constância, e uma fila de sessenta itens num dia ruim faz a
 * pessoa desistir do hábito inteiro. O resto continua vencido e aparece
 * amanhã, quando cabe.
 */
export default async function ReviewPage() {
  const supabase = await createClient();

  const [queue, pulse, { data: areas }] = await Promise.all([
    getDueQueue(supabase, 12),
    getPulse(supabase),
    supabase.from("areas").select("id, name, slug, color, icon, sort_order").order("sort_order"),
  ]);

  const areaList = (areas ?? []) as Area[];

  // Nada vencido: mostra o que está chegando, para a tela não ser um beco.
  const { data: upcoming } =
    queue.length === 0
      ? await supabase
          .from("items")
          .select(
            "id, kind, title, summary, why_useful, url, source_meta, area_id, stage, strength, interval_days, last_reviewed_at, next_review_at",
          )
          .neq("stage", "seed")
          .neq("status", "archived")
          .not("next_review_at", "is", null)
          .order("next_review_at", { ascending: true })
          .limit(5)
      : { data: null };

  const areaById = new Map(areaList.map((a) => [a.id, a]));

  return (
    <div className="space-y-10">
      <PageHeader
        title={
          <>
            O que está <span className="text-ember">esfriando</span>
          </>
        }
        description={
          queue.length > 0
            ? "Tente lembrar antes de revelar. O esforço de recuperar é o que fixa. Ler o resumo direto só produz a sensação de saber."
            : "Nada vencido agora. A fila se enche sozinha conforme a memória do que você guardou decai."
        }
        action={
          pulse.due > queue.length ? (
            <span className="rounded-[3px] bg-[hsl(var(--ember)/0.1)] px-2 py-1 datum text-ember shadow-[inset_0_0_0_1px_hsl(var(--ember)/0.26)]">
              +{pulse.due - queue.length} para amanhã
            </span>
          ) : undefined
        }
      />

      {queue.length > 0 ? (
        <ReviewSession queue={queue} areas={areaList} />
      ) : pulse.total === 0 ? (
        <Empty
          icon={Sprout}
          title="Sem nada para revisar"
          action={
            <>
              <PlantButton />
              <Button asChild variant="outline">
                <Link href="/fluxo">Capturar</Link>
              </Button>
            </>
          }
        >
          Seu cérebro ainda está vazio, então não há memória para decair. Plante o acervo de exemplo e a
          fila aparece na hora, já com itens vencidos.
        </Empty>
      ) : (
        <>
          <Empty
            icon={CalendarClock}
            title="Fila em dia"
            action={
              <>
                <Button asChild>
                  <Link href="/fluxo">Capturar algo novo</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/mapa">Ver conexões</Link>
                </Button>
              </>
            }
          >
            Tudo que você guardou está firme o bastante por enquanto. Os próximos vencimentos estão
            logo abaixo.
          </Empty>

          {(upcoming ?? []).length > 0 && (
            <section className="enter-up">
              <SectionHeader label="Chegando" count={`${pulse.due_soon} em 3 dias`} />
              <div className="stagger space-y-3">
                {(upcoming ?? []).map((item, i) => (
                  <ItemCard
                    key={item.id}
                    index={i}
                    item={item as never}
                    area={item.area_id ? areaById.get(item.area_id) : undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
