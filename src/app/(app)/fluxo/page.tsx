import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPulse } from "@/lib/brain";
import { CaptureBar } from "@/components/capture-bar";
import { Distiller } from "@/components/distiller";
import { ItemCard } from "@/components/item-card";
import { PageHeader, SectionHeader } from "@/components/chrome";
import { PlantButton } from "@/components/pulse";
import { Skeleton } from "@/components/ui/skeleton";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Fluxo — a boca do cérebro.
 *
 * Junta o que a v1 separava em duas ideias mal resolvidas: capturar e triar.
 * São o mesmo movimento em tempos diferentes — entra cru agora, vira
 * conhecimento quando você tiver cinco minutos —, e ver as duas pontas na
 * mesma tela é o que deixa claro que a fila tem fim.
 */
export default async function FlowPage() {
  const supabase = await createClient();

  const [{ data: seeds }, { data: areas }, { data: recent }, pulse] = await Promise.all([
    supabase
      .from("items")
      .select("id, kind, title, content, url, created_at")
      .eq("stage", "seed")
      .order("created_at", { ascending: false }),
    supabase.from("areas").select("id, name, slug, color, icon, sort_order").order("sort_order"),
    supabase
      .from("items")
      .select(
        "id, kind, title, summary, why_useful, url, source_meta, area_id, stage, strength, interval_days, last_reviewed_at, next_review_at",
      )
      .neq("stage", "seed")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(5),
    getPulse(supabase),
  ]);

  const areaList = (areas ?? []) as Area[];
  const areaById = new Map(areaList.map((a) => [a.id, a]));
  const seedList = seeds ?? [];

  return (
    <div className="space-y-10">
      <PageHeader
        title={
          <>
            Entra cru, sai <span className="text-acid">seu</span>
          </>
        }
        description="Capture sem pensar em categoria. Depois destile o lote inteiro numa chamada, e cada semente destilada entra no ciclo de revisão com data marcada."
        action={pulse.total === 0 ? <PlantButton variant="outline" /> : undefined}
      />

      {/* CaptureBar lê searchParams (Share Target), então precisa de Suspense. */}
      <Suspense fallback={<Skeleton className="h-52 w-full" />}>
        <CaptureBar />
      </Suspense>

      <section className="enter-up">
        <Distiller seeds={seedList} areas={areaList} />
      </section>

      {(recent ?? []).length > 0 && (
        <section className="enter-up">
          <SectionHeader
            label="Já destilado"
            count={`${pulse.sprouts + pulse.grown + pulse.rooted} no ciclo`}
          />
          <div className="stagger space-y-3">
            {(recent ?? []).map((item, i) => (
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
    </div>
  );
}
