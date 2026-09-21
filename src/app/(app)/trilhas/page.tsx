import Link from "next/link";
import { Route } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TrackGenerator } from "@/components/track-generator";
import { Empty, PageHeader } from "@/components/chrome";
import { Progress } from "@/components/ui/progress";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TracksPage() {
  const supabase = await createClient();

  const [{ data: tracks }, { data: areas }] = await Promise.all([
    supabase
      .from("tracks")
      .select("id, title, description, status, area_id, track_topics(done)")
      .order("updated_at", { ascending: false }),
    supabase.from("areas").select("id, name, slug, color, icon, sort_order").order("sort_order"),
  ]);

  const areaById = new Map(((areas ?? []) as Area[]).map((a) => [a.id, a]));
  const list = tracks ?? [];

  return (
    <div className="space-y-10">
      <PageHeader
        title={
          <>
            Roteiros do que <span className="text-acid">já é seu</span>
          </>
        }
        description="A IA monta o percurso em cima do que você guardou naquela área, não em cima de uma ementa genérica."
        action={<TrackGenerator areas={(areas ?? []) as Area[]} />}
      />

      {list.length === 0 ? (
        <Empty icon={Route} title="Nenhuma trilha ainda">
          Escolha uma área e deixe a IA montar o roteiro a partir do seu acervo.
        </Empty>
      ) : (
        <div className="stagger space-y-3">
          {list.map((t, i) => {
            const topics = (t.track_topics ?? []) as { done: boolean }[];
            const done = topics.filter((x) => x.done).length;
            const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;
            const area = t.area_id ? areaById.get(t.area_id) : undefined;
            const complete = pct === 100 && topics.length > 0;

            return (
              <Link
                key={t.id}
                href={`/trilhas/${t.id}`}
                className="spotlight group block rounded-lg bg-surface p-5 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.28),0_24px_48px_-30px_hsl(0_0%_0%/0.9)]"
              >
                <span aria-hidden className="ticks absolute inset-0 rounded-lg" />

                <div className="flex items-start gap-4">
                  <span className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground/50">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-pretty font-medium leading-snug">{t.title}</p>
                      <span
                        className={`numeral shrink-0 text-2xl ${complete ? "text-acid" : "text-foreground/70"}`}
                        data-numeric
                      >
                        {pct}
                        <span className="ml-0.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
                          %
                        </span>
                      </span>
                    </div>

                    {t.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {t.description}
                      </p>
                    )}

                    <div className="mt-4">
                      <Progress value={pct} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 datum">
                      <span className="tabular-nums">
                        {done}/{topics.length} concluídos
                      </span>
                      {area && (
                        <>
                          <span className="text-muted-foreground/35">·</span>
                          <span style={{ color: area.color }}>{area.name}</span>
                        </>
                      )}
                      {t.status !== "active" && (
                        <>
                          <span className="text-muted-foreground/35">·</span>
                          <span>{t.status === "done" ? "Concluída" : "Pausada"}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
